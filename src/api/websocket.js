const WS_URL = "http://13.50.238.160:8005";

export const connectWebSocket = (
  sessionToken,
  onMessage
) => {
  if (!sessionToken) {
    console.error("❌ No session token found");
    return null;
  }

  console.log("🔌 Connecting to WebSocket...");

  const ws = new WebSocket(
    `${WS_URL}?session_token=${encodeURIComponent(sessionToken)}`
  );

  ws.onopen = () => {
    console.log("✅ WebSocket connected");
  };

  ws.onmessage = (event) => {
    console.log("📩 WebSocket raw message:", event.data);

    try {
      const data = JSON.parse(event.data);

      console.log("📩 WebSocket parsed message:", data);

      if (onMessage) {
        onMessage(data);
      }
    } catch (error) {
      console.error("❌ Invalid WebSocket JSON:", error);
    }
  };

  ws.onerror = (error) => {
    console.error("❌ WebSocket error:", error);
  };

  ws.onclose = (event) => {
    console.log(
      "🔌 WebSocket closed:",
      event.code,
      event.reason
    );
  };

  return ws;
};