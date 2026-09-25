import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getRoomHistoryApi,
  uploadFileApi,
} from "../api/roomApi";

import {
  connectWebSocket,
} from "../api/websocket";

const API_URL = "http://192.168.1.120:8000";

const ChatRoom = () => {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();

  const roomId =
    routeRoomId || sessionStorage.getItem("room_id") || "";

  const sessionToken =
    sessionStorage.getItem("session_token");

  const userName =
    sessionStorage.getItem("user_name") || "Guest";

  const validRoomId = Boolean(roomId.trim());

  
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

 
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingMessage, setPendingMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");


  const socketRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  
  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pendingFile]);



  const getFileUrl = (fileId) => {
    if (!fileId || !sessionToken) {
      return "";
    }

    return `${API_URL}/file/${encodeURIComponent(
      fileId
    )}?session_token=${encodeURIComponent(sessionToken)}`;
  };



  const openFile = (fileId) => {
    if (!fileId) return;

    if (!sessionToken) {
      setError("Session token is missing.");
      return;
    }

    const fileUrl = getFileUrl(fileId);

    if (!fileUrl) return;

    window.open(
      fileUrl,
      "_blank",
      "noopener,noreferrer"
    );
  };



  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (!validRoomId) {
        setError("Please enter a valid room ID.");
        setLoading(false);
        return;
      }

      if (!sessionToken) {
        setError(
          "Session token is missing. Please join the room again."
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await getRoomHistoryApi(
          roomId,
          sessionToken
        );

        const history =
          response.data?.messages ||
          response.data?.data ||
          [];

        if (!cancelled) {
          setMessages(
            Array.isArray(history) ? history : []
          );
        }
      } catch (err) {
        console.error("History error:", err);

        if (!cancelled) {
          setError(
            err.response?.data?.detail ||
              "Unable to load previous messages."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [roomId, sessionToken, validRoomId]);


  useEffect(() => {
    if (!validRoomId) {
      setConnected(false);
      setError("Please enter a valid room ID.");
      return;
    }

    if (!sessionToken) {
      setConnected(false);
      setError(
        "Session token is missing. Please join the room again."
      );
      return;
    }

    const ws = connectWebSocket(
      sessionToken,
      (data) => {
       
        if (data.type === "connection") {
          setConnected(true);
          setError("");
          return;
        }

     
        if (data.type === "message" && data.data) {
          const incomingMessage = data.data;

         
          setMessages((previousMessages) => {
            const alreadyExists =
              incomingMessage._id &&
              previousMessages.some(
                (item) =>
                  item._id === incomingMessage._id
              );

            if (alreadyExists) {
              return previousMessages;
            }

            return [...previousMessages, incomingMessage];
          });
        }
      }
    );

    if (!ws) {
      setError("Unable to create WebSocket connection.");
      return;
    }

    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError("");
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      setConnected(false);
      setError("WebSocket connection error.");
    };

    ws.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.close();

      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    };
  }, [roomId, sessionToken, validRoomId]);



  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  

  const sendMessage = () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) return;

    if (!validRoomId) {
      setError("Please enter a valid room ID.");
      return;
    }

    if (
      !socketRef.current ||
      socketRef.current.readyState !== WebSocket.OPEN
    ) {
      setError("WebSocket is not connected.");
      return;
    }

    const messageData = {
      type: "message",
      message: trimmedMessage,
      file_id: null,
    };

    socketRef.current.send(
      JSON.stringify(messageData)
    );

    setMessage("");
    setError("");
  };



  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

 

  const openFilePicker = () => {
    if (!validRoomId) {
      setError("Please enter a valid room ID.");
      return;
    }

    if (!connected) {
      setError("WebSocket is not connected.");
      return;
    }

    if (uploading) return;

    fileInputRef.current?.click();
  };

  

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    if (!validRoomId) {
      setError("Please enter a valid room ID.");
      return;
    }

    if (!sessionToken) {
      setError("Session token is missing.");
      return;
    }

    setPendingFile(file);
    setPendingMessage("");
    setError("");
  };

 

  const cancelSelectedFile = () => {
    if (uploading) return;

    setPendingFile(null);
    setPendingMessage("");
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  

  const handleSendFile = async () => {
    if (!pendingFile || uploading) return;

    if (!validRoomId) {
      setError("Please enter a valid room ID.");
      return;
    }

    if (!sessionToken) {
      setError("Session token is missing.");
      return;
    }

    if (
      !socketRef.current ||
      socketRef.current.readyState !== WebSocket.OPEN
    ) {
      setError("WebSocket is not connected.");
      return;
    }

    const file = pendingFile;
    const caption = pendingMessage.trim();

    try {
      setUploading(true);
      setError("");

      const response = await uploadFileApi(
        roomId,
        sessionToken,
        file
      );

      
      const uploadedFile =
        response.data?.data || response.data;

      const fileId = uploadedFile?.file_id;

      if (!fileId) {
        throw new Error(
          "Backend did not return file_id."
        );
      }

      const filename =
        uploadedFile.filename || file.name;

      const contentType =
        uploadedFile.content_type ||
        file.type ||
        "application/octet-stream";

      const size =
        uploadedFile.size ?? file.size;

      const fileMessage = {
        type: "message",
        message: caption,
        file_id: fileId,
        filename,
        content_type: contentType,
        size,
      };

      if (
        socketRef.current?.readyState !== WebSocket.OPEN
      ) {
        throw new Error(
          "File uploaded, but WebSocket disconnected before sending."
        );
      }

      socketRef.current.send(
        JSON.stringify(fileMessage)
      );

     
      setPendingFile(null);
      setPendingMessage("");
      setError("");
    } catch (err) {
      console.error("File upload failed:", err);

      setError(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          err.message ||
          "File upload failed."
      );
    } finally {
      setUploading(false);
    }
  };

 

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    sessionStorage.removeItem("room_id");
    sessionStorage.removeItem("session_token");
    sessionStorage.removeItem("user_name");

    navigate("/");
  };

  

  const formatMessageTime = (createdAt) => {
    if (!createdAt) return "";

    try {
      return new Date(createdAt).toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      );
    } catch {
      return "";
    }
  };



  const renderFileContent = (item) => {
    const fileId = item.file_id;
    const fileUrl = getFileUrl(fileId);

    const contentType = item.content_type || "";
    const filename = item.filename || "Shared file";

    if (contentType.startsWith("image/")) {
      return (
        <div className="media-message">
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={fileUrl}
                alt={filename}
                className="shared-image"
                loading="lazy"
                onError={() => {
                  console.error(
                    "Image failed to load:",
                    fileId
                  );
                }}
              />
            </a>
          ) : (
            <div className="file-message">
              Image URL is unavailable.
            </div>
          )}

          <div className="media-file-name">
            {filename}
          </div>
        </div>
      );
    }

   
    if (contentType.startsWith("video/")) {
      return (
        <div className="media-message">
          {fileUrl ? (
            <video
              className="shared-video"
              controls
              preload="metadata"
            >
              <source
                src={fileUrl}
                type={contentType}
              />
              Your browser does not support video playback.
            </video>
          ) : (
            <div className="file-message">
              Video URL is unavailable.
            </div>
          )}

          <div className="media-file-name">
            {filename}
          </div>
        </div>
      );
    }

    return (
      <div className="file-message">
        <div className="file-icon">📎</div>

        <div className="file-details">
          <strong>{filename}</strong>

          <span>
            {contentType || "Shared file"}
            {item.size
              ? ` · ${(item.size / 1024).toFixed(1)} KB`
              : ""}
          </span>

          <button
            type="button"
            onClick={() => openFile(fileId)}
            style={{
              marginTop: "7px",
              border: "none",
              borderRadius: "8px",
              padding: "6px 10px",
              cursor: "pointer",
              background: "white",
              color: "#7b4fa3",
              fontWeight: "700",
              fontSize: "12px",
            }}
          >
            Open File
          </button>
        </div>
      </div>
    );
  };


  const renderSelectedFilePreview = () => {
    if (!pendingFile) return null;

    const contentType = pendingFile.type || "";

    const isImage = contentType.startsWith("image/");
    const isVideo = contentType.startsWith("video/");

    return (
      <div className="selected-file-preview">
        {/* IMAGE PREVIEW */}
        {isImage && previewUrl && (
          <img
            src={previewUrl}
            alt={pendingFile.name}
            className="selected-file-thumbnail"
          />
        )}

        {isVideo && previewUrl && (
          <video
            src={previewUrl}
            controls
            className="selected-file-thumbnail"
          />
        )}

     
        {!isImage && !isVideo && (
          <div className="selected-file-icon">
            📎
          </div>
        )}

        <div className="selected-file-details">
          <strong>{pendingFile.name}</strong>

          <span>
            {contentType || "File"} ·{" "}
            {(pendingFile.size / 1024).toFixed(1)} KB
          </span>

        
          <textarea
            className="file-caption-input"
            placeholder="Write a message with this file..."
            value={pendingMessage}
            onChange={(event) =>
              setPendingMessage(event.target.value)
            }
            rows={2}
            disabled={uploading}
          />

          
          <div className="selected-file-actions">
            <button
              type="button"
              className="cancel-file-button"
              onClick={cancelSelectedFile}
              disabled={uploading}
            >
              Cancel
            </button>

            <button
              type="button"
              className="send-file-button"
              onClick={handleSendFile}
              disabled={uploading || !connected}
            >
              {uploading ? "Uploading..." : "Send File"}
            </button>
          </div>
        </div>
      </div>
    );
  };

 

  return (
    <div className="chat-page">
      {/* HEADER */}
      <header className="chat-header">
        <div className="chat-brand">
          <div className="chat-logo">
            <span>Q</span>
            <span className="chat-logo-bolt">⚡</span>
            <span>S</span>
          </div>

          <div>
            <div className="chat-brand-name">
              Quick Share
            </div>

            <div className="chat-room-label">
              ROOM · {roomId || "No room ID"}
            </div>
          </div>
        </div>

        <div className="chat-header-actions">
          <div className="chat-user-info">
            <div className="chat-user-name">
              {userName}
            </div>

            <div
              className={
                connected
                  ? "status-online"
                  : "status-offline"
              }
            >
              {connected ? "● Connected" : "● Disconnected"}
            </div>
          </div>

          <button
            className="exit-button"
            onClick={leaveRoom}
          >
            Leave
          </button>
        </div>
      </header>

      
      <main className="chat-main">
       

        {error && (
          <div className="chat-error">
            {error}
          </div>
        )}

        
        <div className="messages-container">
          {loading ? (
            <div className="chat-empty-state">
              <div className="loading-spinner" />
              <h2>Loading messages...</h2>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="empty-chat-icon">
                💬
              </div>

              <h2>No messages yet</h2>
              <p>Start the conversation!</p>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((item, index) => {
                const messageUser =
                  item.user_name ||
                  item.username ||
                  "User";

                const isMine = messageUser === userName;

                const messageTime = formatMessageTime(
                  item.created_at
                );

                const hasFile = Boolean(item.file_id);

                return (
                  <div
                    key={
                      item._id ||
                      `${item.created_at || "message"}-${index}`
                    }
                    className={`message-row ${
                      isMine
                        ? "message-row-mine"
                        : "message-row-other"
                    }`}
                  >
                    {!isMine && (
                      <div className="message-avatar other-avatar">
                        {messageUser.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div
                      className={`message-wrapper ${
                        isMine
                          ? "mine-wrapper"
                          : "other-wrapper"
                      }`}
                    >
                      <div
                        className={`message-sender ${
                          isMine
                            ? "mine-sender"
                            : "other-sender"
                        }`}
                      >
                        {isMine ? "You" : messageUser}
                      </div>

                      <div
                        className={`message-bubble ${
                          isMine
                            ? "mine-bubble"
                            : "other-bubble"
                        }`}
                      >
                        {/* FILE CONTENT */}
                        {hasFile && renderFileContent(item)}

                        {/* CAPTION / TEXT */}
                        {item.message && (
                          <div
                            className={`message-text ${
                              hasFile ? "file-caption" : ""
                            }`}
                          >
                            {item.message}
                          </div>
                        )}

                        <div className="message-meta">
                          <span>{messageTime}</span>

                          {isMine && (
                            <span className="message-check">
                              ✓✓
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isMine && (
                      <div className="message-avatar my-avatar">
                        {userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* MESSAGE COMPOSER */}
      <div className="message-composer">
        {/* SELECTED FILE + CAPTION PREVIEW */}
        {renderSelectedFilePreview()}

        <div className="composer-inner">
          {/* HIDDEN FILE INPUT */}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={handleFileSelect}
          />

          {/* ATTACH FILE */}
          <button
            type="button"
            className="composer-icon-button"
            onClick={openFilePicker}
            disabled={!connected || uploading}
            title="Attach file"
          >
            📎
          </button>

          {/* TEXT INPUT */}
          <input
            type="text"
            className="message-input"
            placeholder={
              connected
                ? "Type a message..."
                : "Connecting..."
            }
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            onKeyDown={handleKeyDown}
            disabled={!connected}
          />

          {/* SEND TEXT */}
          <button
            type="button"
            className="send-button"
            onClick={sendMessage}
            disabled={!connected || !message.trim()}
            title="Send message"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;