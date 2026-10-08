import React, { useEffect, useRef, useState } from "react";

const ScreenShare = ({ socket, userName }) => {
  const [shareRequests, setShareRequests] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isSharing, setIsSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  const peerConnectionsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const stoppingRef = useRef(false);

  const rtcConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  const generateRequestId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .substring(2, 10)}`;
  };

  const sendSocketData = (data) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error("❌ WebSocket is not connected");
      return false;
    }

    socket.send(JSON.stringify(data));
    console.log("📤 Screen Share WebSocket:", data);
    return true;
  };

  const closePeerConnection = (targetUser) => {
    const peer = peerConnectionsRef.current.get(targetUser);

    if (peer) {
      try {
        peer.close();
      } catch (error) {
        console.error("Peer close error:", error);
      }
    }

    peerConnectionsRef.current.delete(targetUser);

    setRemoteStreams((previous) =>
      previous.filter((item) => item.userName !== targetUser)
    );
  };

  const closeAllPeerConnections = () => {
    peerConnectionsRef.current.forEach((peer) => {
      try {
        peer.close();
      } catch (error) {
        console.error("Peer close error:", error);
      }
    });

    peerConnectionsRef.current.clear();
    setRemoteStreams([]);
  };

  const createPeerConnection = (targetUser, isInitiator) => {
    const existingPeer = peerConnectionsRef.current.get(targetUser);

    if (existingPeer) {
      return existingPeer;
    }

    const peer = new RTCPeerConnection(rtcConfiguration);
    peerConnectionsRef.current.set(targetUser, peer);

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;

      sendSocketData({
        type: "ice_candidate",
        target_user: targetUser,
        candidate: event.candidate,
      });
    };

    peer.ontrack = (event) => {
      const stream = event.streams?.[0];

      if (!stream) return;

      setRemoteStreams((previous) => {
        const exists = previous.some(
          (item) => item.userName === targetUser
        );

        if (exists) {
          return previous.map((item) =>
            item.userName === targetUser
              ? { ...item, stream }
              : item
          );
        }

        return [...previous, { userName: targetUser, stream }];
      });
    };

    peer.onconnectionstatechange = () => {
      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed" ||
        peer.connectionState === "disconnected"
      ) {
        closePeerConnection(targetUser);
      }
    };

    if (isInitiator && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    return peer;
  };

  const startSharingWithUser = async (targetUser) => {
    try {
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        localStreamRef.current = stream;
        setIsSharing(true);
        setShareStatus("You are sharing your screen");

        const videoTrack = stream.getVideoTracks()[0];

        if (videoTrack) {
          videoTrack.onended = () => {
            stopScreenSharing();
          };
        }
      }

      const peer = createPeerConnection(targetUser, true);

      const existingTracks = peer
        .getSenders()
        .map((sender) => sender.track)
        .filter(Boolean);

      localStreamRef.current.getTracks().forEach((track) => {
        if (!existingTracks.includes(track)) {
          peer.addTrack(track, localStreamRef.current);
        }
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      sendSocketData({
        type: "webrtc_offer",
        target_user: targetUser,
        offer: peer.localDescription,
      });
    } catch (error) {
      console.error("❌ Screen sharing failed:", error);
      setShareStatus("Screen sharing could not be started.");
      setIsSharing(false);
    }
  };

  const requestScreenShare = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setShareStatus("WebSocket is not connected.");
      return;
    }

    const requestId = generateRequestId();

    sendSocketData({
      type: "screen_share_request",
      request_id: requestId,
    });

    setShareStatus("Screen share request sent...");
  };

  const acceptScreenShare = (request) => {
    sendSocketData({
      type: "screen_share_response",
      request_id: request.request_id,
      accepted: true,
      target_user: request.user_name,
    });

    setShareRequests((previous) =>
      previous.filter(
        (item) => item.request_id !== request.request_id
      )
    );

    setShareStatus(
      `${request.user_name}'s screen share accepted`
    );
  };

  const rejectScreenShare = (request) => {
    sendSocketData({
      type: "screen_share_response",
      request_id: request.request_id,
      accepted: false,
      target_user: request.user_name,
    });

    setShareRequests((previous) =>
      previous.filter(
        (item) => item.request_id !== request.request_id
      )
    );
  };

  const stopScreenSharing = () => {
    if (stoppingRef.current) return;

    stoppingRef.current = true;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    sendSocketData({
      type: "screen_share_stop",
    });

    closeAllPeerConnections();
    setIsSharing(false);
    setShareStatus("");

    stoppingRef.current = false;
  };

  useEffect(() => {
    if (!socket) return;

    const handleSocketMessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "screen_share_request") {
          if (data.user_name === userName) return;

          setShareRequests((previous) => {
            const exists = previous.some(
              (item) => item.request_id === data.request_id
            );

            if (exists) return previous;

            return [
              ...previous,
              {
                request_id: data.request_id,
                user_name: data.user_name,
              },
            ];
          });

          return;
        }

        if (data.type === "screen_share_response") {
          if (data.target_user !== userName) return;

          if (data.accepted !== true) {
            setShareStatus("A user rejected the screen share request.");
            return;
          }

          const acceptedUser =
            data.user_name ||
            data.from_user ||
            data.responder_user;

          if (!acceptedUser) {
            console.error(
              "❌ Accepted response does not contain the accepting user's username:",
              data
            );
            return;
          }

          await startSharingWithUser(acceptedUser);
          return;
        }

        if (data.type === "webrtc_offer") {
          const fromUser = data.from_user;

          if (!fromUser) return;

          const peer = createPeerConnection(fromUser, false);

          await peer.setRemoteDescription(
            new RTCSessionDescription(data.offer)
          );

          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);

          sendSocketData({
            type: "webrtc_answer",
            target_user: fromUser,
            answer: peer.localDescription,
          });

          return;
        }

        if (data.type === "webrtc_answer") {
          const fromUser = data.from_user;
          if (!fromUser) return;

          const peer = peerConnectionsRef.current.get(fromUser);
          if (!peer) return;

          await peer.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );

          return;
        }

        if (data.type === "ice_candidate") {
          const fromUser = data.from_user;
          if (!fromUser) return;

          const peer = peerConnectionsRef.current.get(fromUser);
          if (!peer) return;

          try {
            await peer.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
          } catch (error) {
            console.error("❌ Failed to add ICE candidate:", error);
          }

          return;
        }

        if (data.type === "screen_share_stop") {
          if (data.user_name) {
            closePeerConnection(data.user_name);
          } else {
            closeAllPeerConnections();
          }
        }
      } catch (error) {
        console.error("❌ Screen Share message error:", error);
      }
    };

    socket.addEventListener("message", handleSocketMessage);

    return () => {
      socket.removeEventListener("message", handleSocketMessage);
    };
  }, [socket, userName]);

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        localStreamRef.current = null;
      }

      closeAllPeerConnections();
    };
  }, []);

  return (
    <div
      style={{
        padding: "8px 16px",
        borderBottom: "1px solid #eee",
        background: "#ffffff",
      }}
    >
      {!isSharing && (
        <button
          type="button"
          onClick={requestScreenShare}
          disabled={
            !socket || socket.readyState !== WebSocket.OPEN
          }
          style={{
            border: "none",
            borderRadius: "9px",
            padding: "8px 14px",
            cursor: "pointer",
            background: "#7b4fa3",
            color: "white",
            fontWeight: "700",
            fontSize: "13px",
          }}
        >
          🖥️ Share Screen
        </button>
      )}

      {shareStatus && (
        <span
          style={{
            marginLeft: "10px",
            fontSize: "12px",
            color: "#7b4fa3",
            fontWeight: "600",
          }}
        >
          {shareStatus}
        </span>
      )}

      {isSharing && (
        <button
          type="button"
          onClick={stopScreenSharing}
          style={{
            border: "none",
            borderRadius: "9px",
            padding: "8px 14px",
            cursor: "pointer",
            background: "#d9534f",
            color: "white",
            fontWeight: "700",
            fontSize: "13px",
          }}
        >
          Stop Sharing
        </button>
      )}

      {shareRequests.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          {shareRequests.map((request) => (
            <div
              key={request.request_id}
              style={{
                padding: "12px",
                border: "1px solid #ddd",
                borderRadius: "10px",
                background: "#faf7ff",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  fontWeight: "700",
                  marginBottom: "8px",
                }}
              >
                {request.user_name} wants to share their screen
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => acceptScreenShare(request)}
                  style={{
                    border: "none",
                    borderRadius: "8px",
                    padding: "6px 12px",
                    cursor: "pointer",
                    background: "#7b4fa3",
                    color: "white",
                    fontWeight: "700",
                  }}
                >
                  Accept
                </button>

                <button
                  type="button"
                  onClick={() => rejectScreenShare(request)}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "6px 12px",
                    cursor: "pointer",
                    background: "white",
                    color: "#555",
                    fontWeight: "700",
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {remoteStreams.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          {remoteStreams.map((item) => (
            <RemoteScreen
              key={item.userName}
              userName={item.userName}
              stream={item.stream}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const RemoteScreen = ({ userName, stream }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      style={{
        marginTop: "10px",
        padding: "10px",
        borderRadius: "10px",
        background: "#f5f0ff",
      }}
    >
      <div
        style={{
          fontWeight: "700",
          fontSize: "13px",
          marginBottom: "8px",
          color: "#6f4395",
        }}
      >
        🖥️ {userName}'s screen
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls
        style={{
          width: "100%",
          maxHeight: "420px",
          borderRadius: "8px",
          background: "#111",
        }}
      />
    </div>
  );
};

export default ScreenShare;
