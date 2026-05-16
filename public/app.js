const connectButton = document.querySelector("#connectButton");
const disconnectButton = document.querySelector("#disconnectButton");
const micButton = document.querySelector("#micButton");
const micDiagnosticButton = document.querySelector("#micDiagnosticButton");
const sendButton = document.querySelector("#sendButton");
const clearLogButton = document.querySelector("#clearLogButton");
const textForm = document.querySelector("#textForm");
const textInput = document.querySelector("#textInput");
const statusPill = document.querySelector("#statusPill");
const eventLog = document.querySelector("#eventLog");
const remoteAudio = document.querySelector("#remoteAudio");

let peerConnection;
let dataChannel;
let localStream;
let micEnabled = true;
let connectionMode = "voice";

connectButton.addEventListener("click", connect);
disconnectButton.addEventListener("click", disconnect);
micButton.addEventListener("click", toggleMic);
micDiagnosticButton.addEventListener("click", diagnoseMicrophone);
clearLogButton.addEventListener("click", () => {
  eventLog.replaceChildren();
});
textForm.addEventListener("submit", sendTextMessage);

setStatus("未接続");
logEvent("ready", "接続ボタンを押すとマイク許可の確認が表示されます。");

async function connect() {
  setBusy(true);
  setStatus("接続中");

  try {
    peerConnection = new RTCPeerConnection();

    peerConnection.ontrack = (event) => {
      [remoteAudio.srcObject] = event.streams;
      logEvent("audio", "モデル音声の受信を開始しました。");
    };

    peerConnection.onconnectionstatechange = () => {
      logEvent("peer", `WebRTC: ${peerConnection.connectionState}`);
      if (peerConnection.connectionState === "connected") {
        document.body.classList.add("connected-state");
        setStatus("接続中", "connected");
      }
      if (["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
        document.body.classList.remove("connected-state");
      }
    };

    localStream = await requestMicrophone();

    if (localStream) {
      connectionMode = "voice";
      for (const track of localStream.getTracks()) {
        peerConnection.addTrack(track, localStream);
      }
    } else {
      connectionMode = "text";
      peerConnection.addTransceiver("audio", { direction: "recvonly" });
      logEvent("mic", "マイク権限が拒否されたため、テキスト入力と音声応答のみで接続します。");
      logEvent("mic", "音声入力にはブラウザ側で localhost:3000 のマイク許可が必要です。");
    }

    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("open", () => {
      logEvent("data", "Realtimeイベントチャネルが開きました。");
      sendButton.disabled = false;
      sendGreeting();
    });
    dataChannel.addEventListener("message", handleServerEvent);
    dataChannel.addEventListener("close", () => logEvent("data", "Realtimeイベントチャネルが閉じました。"));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const response = await fetch("/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp"
      },
      body: offer.sdp
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const answer = {
      type: "answer",
      sdp: await response.text()
    };
    await peerConnection.setRemoteDescription(answer);

    connectButton.disabled = true;
    disconnectButton.disabled = false;
    micButton.disabled = connectionMode !== "voice";
    micButton.textContent = connectionMode === "voice" ? "マイク停止" : "マイクなし";
    setStatus("接続中", "connected");
    logEvent("session", "GPT-Realtime-2セッションを開始しました。");
  } catch (error) {
    logEvent("error", formatError(error));
    disconnect({ keepStatus: true });
    setStatus("エラー", "error");
  } finally {
    setBusy(false);
  }
}

function disconnect(options = {}) {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = undefined;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = undefined;
  }

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
    localStream = undefined;
  }

  remoteAudio.srcObject = null;
  micEnabled = true;
  connectionMode = "voice";
  document.body.classList.remove("connected-state");
  connectButton.disabled = false;
  disconnectButton.disabled = true;
  micButton.disabled = true;
  micButton.textContent = "マイク停止";
  sendButton.disabled = true;
  if (!options.keepStatus) {
    setStatus("未接続");
  }
}

function toggleMic() {
  if (!localStream) {
    logEvent("mic", "この接続ではマイク入力は使われていません。");
    return;
  }

  micEnabled = !micEnabled;
  for (const track of localStream.getAudioTracks()) {
    track.enabled = micEnabled;
  }

  micButton.textContent = micEnabled ? "マイク停止" : "マイク再開";
  logEvent("mic", micEnabled ? "マイク入力を再開しました。" : "マイク入力を停止しました。");
}

async function diagnoseMicrophone() {
  micDiagnosticButton.disabled = true;
  logEvent("mic.check", `secureContext=${window.isSecureContext}`);

  if (!navigator.mediaDevices?.getUserMedia) {
    logEvent("mic.check", "navigator.mediaDevices.getUserMedia が利用できません。");
    micDiagnosticButton.disabled = false;
    return;
  }

  if (navigator.permissions?.query) {
    try {
      const permission = await navigator.permissions.query({ name: "microphone" });
      logEvent("mic.permission", permission.state);
    } catch (error) {
      logEvent("mic.permission", `取得不可: ${formatError(error)}`);
    }
  } else {
    logEvent("mic.permission", "Permissions APIが利用できません。");
  }

  await logAudioDevices("before");

  try {
    const stream = await requestMicrophone({ allowFallback: false });
    const audioTracks = stream.getAudioTracks();
    logEvent("mic.getUserMedia", `OK: audioTracks=${audioTracks.length}`);
    for (const track of audioTracks) {
      logEvent("mic.track", `${track.label || "(label unavailable)"} / ${track.readyState}`);
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch (error) {
    logEvent("mic.getUserMedia", `${error?.name || "Error"}: ${formatError(error)}`);
  }

  await logAudioDevices("after");
  micDiagnosticButton.disabled = false;
}

function sendTextMessage(event) {
  event.preventDefault();

  const text = textInput.value.trim();
  if (!text || !isDataChannelOpen()) {
    return;
  }

  sendRealtimeEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text
        }
      ]
    }
  });
  sendRealtimeEvent({ type: "response.create" });
  logEvent("user", text);
  textInput.value = "";
}

function sendGreeting() {
  if (!isDataChannelOpen()) {
    return;
  }

  sendRealtimeEvent({
    type: "response.create",
    response: {
      instructions: "短く日本語で挨拶し、マイクに話しかけてよいことを伝えてください。"
    }
  });
}

function sendRealtimeEvent(event) {
  dataChannel.send(JSON.stringify(event));
}

async function requestMicrophone(options = {}) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (error) {
    if (options.allowFallback !== false && isPermissionDenied(error)) {
      return null;
    }
    throw error;
  }
}

async function logAudioDevices(stage) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    logEvent(`mic.devices.${stage}`, "enumerateDevices が利用できません。");
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");
    if (audioInputs.length === 0) {
      logEvent(`mic.devices.${stage}`, "audioinput=0");
      return;
    }

    const summary = audioInputs
      .map((device, index) => `${index + 1}:${device.label || "(label hidden)"}`)
      .join(", ");
    logEvent(`mic.devices.${stage}`, summary);
  } catch (error) {
    logEvent(`mic.devices.${stage}`, formatError(error));
  }
}

function handleServerEvent(message) {
  const event = JSON.parse(message.data);

  if (event.type === "error") {
    logEvent("error", event.error?.message || JSON.stringify(event.error));
    return;
  }

  if (event.type === "response.audio_transcript.delta" && event.delta) {
    logEvent("assistant", event.delta);
    return;
  }

  if (event.type === "response.text.delta" && event.delta) {
    logEvent("assistant", event.delta);
    return;
  }

  if (event.type === "response.done") {
    const usage = event.response?.usage;
    const summary = usage
      ? `完了 input=${usage.input_tokens ?? "-"} output=${usage.output_tokens ?? "-"} total=${usage.total_tokens ?? "-"}`
      : "応答が完了しました。";
    logEvent("response.done", summary);
    return;
  }

  if (
    event.type === "input_audio_buffer.speech_started" ||
    event.type === "input_audio_buffer.speech_stopped" ||
    event.type === "session.created" ||
    event.type === "session.updated" ||
    event.type === "response.created"
  ) {
    logEvent(event.type, "OK");
  }
}

async function readError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    return json.detail || json.error || `HTTP ${response.status}`;
  }
  return await response.text();
}

function isDataChannelOpen() {
  return dataChannel?.readyState === "open";
}

function isPermissionDenied(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.name === "NotAllowedError" || message.includes("permission denied");
}

function formatError(error) {
  if (isPermissionDenied(error)) {
    return "マイク権限が拒否されました。ブラウザのサイト設定で localhost:3000 のマイクを許可してから再接続してください。";
  }
  return error?.message || String(error);
}

function setBusy(isBusy) {
  connectButton.disabled = isBusy || Boolean(peerConnection);
}

function setStatus(text, mode) {
  statusPill.textContent = text;
  statusPill.className = "status-pill";
  if (mode) {
    statusPill.classList.add(mode);
  }
}

function logEvent(type, detail) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  const label = document.createElement("strong");
  const body = document.createElement("span");

  time.textContent = new Date().toLocaleTimeString("ja-JP");
  label.textContent = `${type}: `;
  body.textContent = detail;
  item.append(time, label, body);
  eventLog.prepend(item);
}
