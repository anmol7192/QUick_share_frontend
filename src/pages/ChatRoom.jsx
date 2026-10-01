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
  deleteMessageApi,
  uploadFileApi,
} from "../api/roomApi";

import {
  connectWebSocket,
} from "../api/websocket";

// =========================================================
// API URL
// =========================================================

const API_URL = "http://192.168.1.120:8000";

// =========================================================
// CHAT ROOM
// =========================================================

const ChatRoom = () => {
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();

  // =======================================================
  // ROOM / SESSION
  // =======================================================

  const roomId =
    routeRoomId ||
    sessionStorage.getItem("room_id") ||
    "";

  const sessionToken =
    sessionStorage.getItem("session_token");

  const userName =
    sessionStorage.getItem("user_name") ||
    "Guest";

  const validRoomId =
    Boolean(roomId.trim());

  // =======================================================
  // STATE
  // =======================================================

  const [messages, setMessages] =
    useState([]);

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [connected, setConnected] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [error, setError] =
    useState("");

  // =======================================================
  // FILE STATE
  // =======================================================

  const [pendingFile, setPendingFile] =
    useState(null);

  const [pendingMessage, setPendingMessage] =
    useState("");

  const [previewUrl, setPreviewUrl] =
    useState("");

  // =======================================================
  // ACTIVE USERS
  // =======================================================

  const [activeUsers, setActiveUsers] =
    useState([]);

  const [activeUsersCount, setActiveUsersCount] =
    useState(0);

  // =======================================================
  // REFS
  // =======================================================

  const socketRef =
    useRef(null);

  const fileInputRef =
    useRef(null);

  const messagesEndRef =
    useRef(null);

  // =======================================================
  // FILE PREVIEW URL
  // =======================================================

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl("");
      return;
    }

    const url =
      URL.createObjectURL(
        pendingFile
      );

    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pendingFile]);

  // =======================================================
  // FILE URL
  // =======================================================

  const getFileUrl = (fileId) => {
    if (!fileId || !sessionToken) {
      return "";
    }

    return `${API_URL}/file/${encodeURIComponent(
      fileId
    )}?session_token=${encodeURIComponent(
      sessionToken
    )}`;
  };

  // =======================================================
  // DELETE MESSAGE
  // =======================================================

  const handleDeleteMessage = async (
    messageId
  ) => {
    if (!messageId) {
      return;
    }

    if (!sessionToken) {
      setError(
        "Session token is missing."
      );
      return;
    }

    try {
      console.log(
        "🗑️ Deleting message:",
        messageId
      );

      // ---------------------------------------------------
      // DELETE API
      // ---------------------------------------------------

      await deleteMessageApi(
        messageId,
        sessionToken
      );

      // ---------------------------------------------------
      // REMOVE FROM LOCAL STATE
      //
      // Backend also broadcasts message_deleted.
      // This local update makes the deleting user's UI
      // update immediately.
      // ---------------------------------------------------

      setMessages(
        (previousMessages) =>
          previousMessages.filter(
            (item) =>
              String(item._id) !==
              String(messageId)
          )
      );

      setError("");

    } catch (error) {
      console.error(
        "❌ Delete failed:",
        error
      );

      setError(
        error.response?.data?.detail ||
          "Unable to delete message"
      );
    }
  };

  // =======================================================
  // OPEN FILE
  // =======================================================

  const openFile = (fileId) => {
    if (!fileId) {
      return;
    }

    if (!sessionToken) {
      setError(
        "Session token is missing."
      );
      return;
    }

    const fileUrl =
      getFileUrl(fileId);

    if (!fileUrl) {
      return;
    }

    window.open(
      fileUrl,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // =======================================================
  // LOAD MESSAGE HISTORY
  // =======================================================

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (!validRoomId) {
        setError(
          "Please enter a valid room ID."
        );

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

        const response =
          await getRoomHistoryApi(
            roomId,
            sessionToken
          );

        const history =
          response.data?.messages ||
          response.data?.data ||
          [];

        if (!cancelled) {
          setMessages(
            Array.isArray(history)
              ? history
              : []
          );
        }

      } catch (err) {
        console.error(
          "❌ History error:",
          err
        );

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

  }, [
    roomId,
    sessionToken,
    validRoomId,
  ]);

  // =======================================================
  // SINGLE WEBSOCKET CONNECTION
  //
  // This same WebSocket handles:
  //
  // 1. connection
  // 2. message
  // 3. active_users
  // 4. message_deleted
  //
  // =======================================================

  useEffect(() => {
    if (!validRoomId) {
      setConnected(false);

      setError(
        "Please enter a valid room ID."
      );

      return;
    }

    if (!sessionToken) {
      setConnected(false);

      setError(
        "Session token is missing. Please join the room again."
      );

      return;
    }

    console.log(
      "🔌 Starting WebSocket..."
    );

    console.log(
      "🔐 Session token exists:",
      Boolean(sessionToken)
    );

    const ws =
      connectWebSocket(
        sessionToken,
        (data) => {
          console.log(
            "📩 WebSocket event:",
            data
          );

          // =================================================
          // CONNECTION EVENT
          // =================================================

          if (
            data.type ===
            "connection"
          ) {
            console.log(
              "✅ Connected to room:",
              data.room_id
            );

            setConnected(true);
            setError("");

            return;
          }

          // =================================================
          // ACTIVE USERS EVENT
          //
          // {
          //   "type": "active_users",
          //   "count": 2,
          //   "users": [...]
          // }
          // =================================================

          if (
            data.type ===
            "active_users"
          ) {
            console.log(
              "👥 Active users update:",
              data
            );

            // Update count
            setActiveUsersCount(
              Number(data.count) || 0
            );

            // Update users
            setActiveUsers(
              Array.isArray(data.users)
                ? data.users
                : []
            );

            return;
          }

          // =================================================
          // NORMAL MESSAGE EVENT
          //
          // {
          //   "type": "message",
          //   "data": {...}
          // }
          // =================================================

          if (
            data.type === "message" &&
            data.data
          ) {
            const incomingMessage =
              data.data;

            console.log(
              "💬 New message:",
              incomingMessage
            );

            setMessages(
              (previousMessages) => {
                const alreadyExists =
                  incomingMessage._id &&
                  previousMessages.some(
                    (item) =>
                      String(item._id) ===
                      String(
                        incomingMessage._id
                      )
                  );

                if (alreadyExists) {
                  return previousMessages;
                }

                return [
                  ...previousMessages,
                  incomingMessage,
                ];
              }
            );

            return;
          }

          // =================================================
          // MESSAGE DELETED EVENT
          //
          // {
          //   "type": "message_deleted",
          //   "message_id": "MESSAGE_ID"
          // }
          // =================================================

          if (
            data.type ===
              "message_deleted" &&
            data.message_id
          ) {
            const deletedMessageId =
              String(
                data.message_id
              );

            console.log(
              "🗑️ Message deleted event:",
              deletedMessageId
            );

            setMessages(
              (previousMessages) =>
                previousMessages.filter(
                  (item) =>
                    String(item._id) !==
                    deletedMessageId
                )
            );

            return;
          }
        }
      );

    if (!ws) {
      setError(
        "Unable to create WebSocket connection."
      );

      return;
    }

    socketRef.current = ws;

    // =====================================================
    // WEBSOCKET OPEN
    // =====================================================

    ws.onopen = () => {
      console.log(
        "✅ WebSocket connected"
      );

      setConnected(true);
      setError("");
    };

    // =====================================================
    // WEBSOCKET ERROR
    // =====================================================

    ws.onerror = (event) => {
      console.error(
        "❌ WebSocket error:",
        event
      );

      setConnected(false);

      setError(
        "WebSocket connection error."
      );
    };

    // =====================================================
    // WEBSOCKET CLOSE
    // =====================================================

    ws.onclose = (
      event
    ) => {
      console.log(
        "🔌 WebSocket closed:",
        event.code,
        event.reason
      );

      setConnected(false);
    };

    // =====================================================
    // CLEANUP
    // =====================================================

    return () => {
      console.log(
        "🔌 Closing WebSocket..."
      );

      ws.close();

      if (
        socketRef.current === ws
      ) {
        socketRef.current =
          null;
      }
    };

  }, [
    roomId,
    sessionToken,
    validRoomId,
  ]);

  // =======================================================
  // AUTO SCROLL
  // =======================================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView(
      {
        behavior: "smooth",
      }
    );
  }, [messages]);

  // =======================================================
  // SEND TEXT MESSAGE
  // =======================================================

  const sendMessage = () => {
    const trimmedMessage =
      message.trim();

    if (!trimmedMessage) {
      return;
    }

    if (!validRoomId) {
      setError(
        "Please enter a valid room ID."
      );
      return;
    }

    if (
      !socketRef.current ||
      socketRef.current.readyState !==
        WebSocket.OPEN
    ) {
      setError(
        "WebSocket is not connected."
      );
      return;
    }

    const messageData = {
      type: "message",
      message: trimmedMessage,
      file_id: null,
    };

    socketRef.current.send(
      JSON.stringify(
        messageData
      )
    );

    setMessage("");
    setError("");
  };

  // =======================================================
  // ENTER KEY
  // =======================================================

  const handleKeyDown = (
    event
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      sendMessage();
    }
  };

  // =======================================================
  // OPEN FILE PICKER
  // =======================================================

  const openFilePicker = () => {
    if (!validRoomId) {
      setError(
        "Please enter a valid room ID."
      );
      return;
    }

    if (!connected) {
      setError(
        "WebSocket is not connected."
      );
      return;
    }

    if (uploading) {
      return;
    }

    fileInputRef.current?.click();
  };

  // =======================================================
  // SELECT FILE
  // =======================================================

  const handleFileSelect = (
    event
  ) => {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (!validRoomId) {
      setError(
        "Please enter a valid room ID."
      );
      return;
    }

    if (!sessionToken) {
      setError(
        "Session token is missing."
      );
      return;
    }

    setPendingFile(file);
    setPendingMessage("");
    setError("");
  };

  // =======================================================
  // CANCEL FILE
  // =======================================================

  const cancelSelectedFile = () => {
    if (uploading) {
      return;
    }

    setPendingFile(null);
    setPendingMessage("");
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value =
        "";
    }
  };

  // =======================================================
  // SEND FILE
  // =======================================================

  const handleSendFile = async () => {
    if (
      !pendingFile ||
      uploading
    ) {
      return;
    }

    if (!validRoomId) {
      setError(
        "Please enter a valid room ID."
      );
      return;
    }

    if (!sessionToken) {
      setError(
        "Session token is missing."
      );
      return;
    }

    if (
      !socketRef.current ||
      socketRef.current.readyState !==
        WebSocket.OPEN
    ) {
      setError(
        "WebSocket is not connected."
      );
      return;
    }

    const file =
      pendingFile;

    const caption =
      pendingMessage.trim();

    try {
      setUploading(true);
      setError("");

      // ---------------------------------------------------
      // UPLOAD FILE
      // ---------------------------------------------------

      const response =
        await uploadFileApi(
          roomId,
          sessionToken,
          file
        );

      const uploadedFile =
        response.data?.data ||
        response.data;

      const fileId =
        uploadedFile?.file_id;

      if (!fileId) {
        throw new Error(
          "Backend did not return file_id."
        );
      }

      const filename =
        uploadedFile.filename ||
        file.name;

      const contentType =
        uploadedFile.content_type ||
        file.type ||
        "application/octet-stream";

      const size =
        uploadedFile.size ??
        file.size;

      // ---------------------------------------------------
      // FILE MESSAGE
      // ---------------------------------------------------

      const fileMessage = {
        type: "message",
        message: caption,
        file_id: fileId,
        filename,
        content_type:
          contentType,
        size,
      };

      if (
        socketRef.current?.readyState !==
        WebSocket.OPEN
      ) {
        throw new Error(
          "File uploaded, but WebSocket disconnected before sending."
        );
      }

      // ---------------------------------------------------
      // SEND FILE MESSAGE THROUGH SAME WEBSOCKET
      // ---------------------------------------------------

      socketRef.current.send(
        JSON.stringify(
          fileMessage
        )
      );

      setPendingFile(null);
      setPendingMessage("");
      setError("");

    } catch (err) {
      console.error(
        "❌ File upload failed:",
        err
      );

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

  // =======================================================
  // LEAVE ROOM
  // =======================================================

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    sessionStorage.removeItem(
      "room_id"
    );

    sessionStorage.removeItem(
      "session_token"
    );

    sessionStorage.removeItem(
      "user_name"
    );

    navigate("/");
  };

  // =======================================================
  // FORMAT TIME
  // =======================================================

  const formatMessageTime = (
    createdAt
  ) => {
    if (!createdAt) {
      return "";
    }

    try {
      return new Date(
        createdAt
      ).toLocaleTimeString(
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

  // =======================================================
  // RENDER FILE CONTENT
  // =======================================================

  const renderFileContent = (
    item
  ) => {
    const fileId =
      item.file_id;

    const fileUrl =
      getFileUrl(fileId);

    const contentType =
      item.content_type || "";

    const filename =
      item.filename ||
      "Shared file";

    // -----------------------------------------------------
    // IMAGE
    // -----------------------------------------------------

    if (
      contentType.startsWith(
        "image/"
      )
    ) {
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

    // -----------------------------------------------------
    // VIDEO
    // -----------------------------------------------------

    if (
      contentType.startsWith(
        "video/"
      )
    ) {
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

              Your browser does not support
              video playback.
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

    // -----------------------------------------------------
    // OTHER FILE
    // -----------------------------------------------------

    return (
      <div className="file-message">
        <div className="file-icon">
          📎
        </div>

        <div className="file-details">
          <strong>
            {filename}
          </strong>

          <span>
            {contentType ||
              "Shared file"}

            {item.size
              ? ` · ${(item.size / 1024).toFixed(
                  1
                )} KB`
              : ""}
          </span>

          <button
            type="button"
            onClick={() =>
              openFile(fileId)
            }
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

  // =======================================================
  // SELECTED FILE PREVIEW
  // =======================================================

  const renderSelectedFilePreview =
    () => {
      if (!pendingFile) {
        return null;
      }

      const contentType =
        pendingFile.type || "";

      const isImage =
        contentType.startsWith(
          "image/"
        );

      const isVideo =
        contentType.startsWith(
          "video/"
        );

      return (
        <div className="selected-file-preview">

          {/* IMAGE */}

          {isImage &&
            previewUrl && (
              <img
                src={previewUrl}
                alt={
                  pendingFile.name
                }
                className="selected-file-thumbnail"
              />
            )}

          {/* VIDEO */}

          {isVideo &&
            previewUrl && (
              <video
                src={previewUrl}
                controls
                className="selected-file-thumbnail"
              />
            )}

          {/* OTHER FILE */}

          {!isImage &&
            !isVideo && (
              <div className="selected-file-icon">
                📎
              </div>
            )}

          <div className="selected-file-details">

            <strong>
              {pendingFile.name}
            </strong>

            <span>
              {contentType ||
                "File"}{" "}
              ·{" "}
              {(
                pendingFile.size /
                1024
              ).toFixed(1)}{" "}
              KB
            </span>

            {/* CAPTION */}

            <textarea
              className="file-caption-input"
              placeholder="Write a message with this file..."
              value={
                pendingMessage
              }
              onChange={(
                event
              ) =>
                setPendingMessage(
                  event.target.value
                )
              }
              rows={2}
              disabled={
                uploading
              }
            />

            {/* ACTIONS */}

            <div className="selected-file-actions">

              <button
                type="button"
                className="cancel-file-button"
                onClick={
                  cancelSelectedFile
                }
                disabled={
                  uploading
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="send-file-button"
                onClick={
                  handleSendFile
                }
                disabled={
                  uploading ||
                  !connected
                }
              >
                {uploading
                  ? "Uploading..."
                  : "Send File"}
              </button>

            </div>
          </div>
        </div>
      );
    };

  // =======================================================
  // UI
  // =======================================================

  return (
    <div className="chat-page">

      {/* =================================================
          HEADER
          ================================================= */}

      <header className="chat-header">

        <div className="chat-brand">

          <div className="chat-logo">
            <span>Q</span>
            <span className="chat-logo-bolt">
              ⚡
            </span>
            <span>S</span>
          </div>

          <div>

            <div className="chat-brand-name">
              Quick Share
            </div>

            <div className="chat-room-label">
              ROOM ·{" "}
              {roomId ||
                "No room ID"}
            </div>

            {/* ACTIVE USERS */}

            <div className="chat-room-label">

              Active users (
              {activeUsersCount}
              )

              {activeUsers.length >
                0 && (
                <span>
                  {" · "}

                  {activeUsers
                    .map(
                      (user) =>
                        user.user_name
                    )
                    .filter(Boolean)
                    .join(
                      ", "
                    )}
                </span>
              )}

            </div>

          </div>
        </div>

        {/* HEADER RIGHT */}

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
              {connected
                ? "● Connected"
                : "● Disconnected"}
            </div>

          </div>

          <button
            className="exit-button"
            onClick={
              leaveRoom
            }
          >
            Leave
          </button>

        </div>

      </header>

      {/* =================================================
          MAIN CHAT
          ================================================= */}

      <main className="chat-main">

        {/* ERROR */}

        {error && (
          <div className="chat-error">
            {error}
          </div>
        )}

        {/* MESSAGES */}

        <div className="messages-container">

          {loading ? (
            <div className="chat-empty-state">

              <div className="loading-spinner" />

              <h2>
                Loading messages...
              </h2>

            </div>

          ) : messages.length ===
            0 ? (
            <div className="chat-empty-state">

              <div className="empty-chat-icon">
                💬
              </div>

              <h2>
                No messages yet
              </h2>

              <p>
                Start the conversation!
              </p>

            </div>

          ) : (
            <div className="messages-list">

              {messages.map(
                (
                  item,
                  index
                ) => {

                  const messageUser =
                    item.user_name ||
                    item.username ||
                    "User";

                  const isMine =
                    messageUser ===
                    userName;

                  const messageTime =
                    formatMessageTime(
                      item.sent_at ||
                        item.created_at
                    );

                  const hasFile =
                    Boolean(
                      item.file_id
                    );

                  return (
                    <div
                      key={
                        item._id ||
                        `${
                          item.sent_at ||
                          item.created_at ||
                          "message"
                        }-${index}`
                      }
                      className={`message-row ${
                        isMine
                          ? "message-row-mine"
                          : "message-row-other"
                      }`}
                    >

                      {/* OTHER USER AVATAR */}

                      {!isMine && (
                        <div className="message-avatar other-avatar">
                          {messageUser
                            .charAt(
                              0
                            )
                            .toUpperCase()}
                        </div>
                      )}

                      <div
                        className={`message-wrapper ${
                          isMine
                            ? "mine-wrapper"
                            : "other-wrapper"
                        }`}
                      >

                        {/* SENDER */}

                        <div
                          className={`message-sender ${
                            isMine
                              ? "mine-sender"
                              : "other-sender"
                          }`}
                        >
                          {isMine
                            ? "You"
                            : messageUser}
                        </div>

                        {/* MESSAGE BUBBLE */}

                        <div
                          className={`message-bubble ${
                            isMine
                              ? "mine-bubble"
                              : "other-bubble"
                          }`}
                        >

                          {/* FILE */}

                          {hasFile &&
                            renderFileContent(
                              item
                            )}

                          {/* TEXT */}

                          {item.message && (
                            <div
                              className={`message-text ${
                                hasFile
                                  ? "file-caption"
                                  : ""
                              }`}
                            >
                              {
                                item.message
                              }
                            </div>
                          )}

                          {/* MESSAGE META */}

                          <div className="message-meta">

                            <span>
                              {
                                messageTime
                              }
                            </span>

                            {isMine && (
                              <span className="message-check">
                                ✓✓
                              </span>
                            )}

                            {/* DELETE */}

                            {isMine &&
                              item._id && (
                                <button
                                  type="button"
                                  className="delete-message-button"
                                  onClick={() =>
                                    handleDeleteMessage(
                                      item._id
                                    )
                                  }
                                  title="Delete message"
                                >
                                  Delete
                                </button>
                              )}

                          </div>

                        </div>

                      </div>

                      {/* MY AVATAR */}

                      {isMine && (
                        <div className="message-avatar my-avatar">
                          {userName
                            .charAt(
                              0
                            )
                            .toUpperCase()}
                        </div>
                      )}

                    </div>
                  );
                }
              )}

              <div
                ref={
                  messagesEndRef
                }
              />

            </div>
          )}

        </div>

      </main>

      {/* =================================================
          MESSAGE COMPOSER
          ================================================= */}

      <div className="message-composer">

        {/* SELECTED FILE */}

        {renderSelectedFilePreview()}

        <div className="composer-inner">

          {/* HIDDEN FILE INPUT */}

          <input
            ref={
              fileInputRef
            }
            type="file"
            hidden
            onChange={
              handleFileSelect
            }
          />

          {/* ATTACH */}

          <button
            type="button"
            className="composer-icon-button"
            onClick={
              openFilePicker
            }
            disabled={
              !connected ||
              uploading
            }
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
            onChange={(
              event
            ) =>
              setMessage(
                event.target.value
              )
            }
            onKeyDown={
              handleKeyDown
            }
            disabled={
              !connected
            }
          />

          {/* SEND */}

          <button
            type="button"
            className="send-button"
            onClick={
              sendMessage
            }
            disabled={
              !connected ||
              !message.trim()
            }
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