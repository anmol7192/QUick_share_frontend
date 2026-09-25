
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createRoomApi,
  joinRoomApi,
} from "../api/roomApi";

function Home() {
  const navigate = useNavigate();

  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  
  const validateRoomId = () => {
    const trimmedRoomId = roomId.trim();

    if (!/^\d{6}$/.test(trimmedRoomId)) {
      setError("Room ID must contain exactly 6 digits.");
      return false;
    }

    setError("");
    return true;
  };

 
  const saveSessionAndNavigate = (data) => {
    if (!data.session_token || !data.room_id) {
      throw new Error(
        "Backend did not return a valid session or Room ID."
      );
    }

    sessionStorage.setItem("session_token", data.session_token);
    sessionStorage.setItem("user_name", data.user_name || "");
    sessionStorage.setItem("room_id", data.room_id);

    navigate(`/room/${encodeURIComponent(data.room_id)}`);
  };

  
  const handleCreateRoom = async () => {
    if (!validateRoomId()) return;

    try {
      setLoading(true);
      setError("");

      const finalRoomId = roomId.trim();

      const response = await createRoomApi(finalRoomId);
      const data = response.data;

      saveSessionAndNavigate(data);
    } catch (err) {
      console.error("Create Room API Error:", err);
      console.error("Backend response:", err.response?.data);

      const detail = err.response?.data?.detail;

      if (
        err.response?.status === 409 ||
        err.response?.status === 400 &&
          String(detail).toLowerCase().includes("already exists")
      ) {
        setError("Room already exists. Please join this room.");
      } else {
        setError(
          detail || err.message || "Failed to create room."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!validateRoomId()) return;

    try {
      setLoading(true);
      setError("");

      const finalRoomId = roomId.trim();

      const response = await joinRoomApi(finalRoomId);
      const data = response.data;

      saveSessionAndNavigate(data);
    } catch (err) {
      console.error("Join Room API Error:", err);
      console.error("Backend response:", err.response?.data);

      setError(
        err.response?.status === 404
          ? "Room not found. Please create the room first."
          : err.response?.data?.detail ||
              err.message ||
              "Failed to join room."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      <main className="home-container">
        {/* LOGO */}
        <div className="main-logo">
          <span className="logo-q">Q</span>
          <span className="logo-lightning">⚡</span>
          <span className="logo-s">S</span>
        </div>

        {/* TITLE */}
        <h1 className="home-title">
          Quick <span>Share</span>
        </h1>

        {/* ROOM FORM */}
        <div className="home-form">
          <label htmlFor="room-id">Enter Room ID</label>

          <input
            id="room-id"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="Enter 6-digit Room ID"
            value={roomId}
            onChange={(event) => {
              const digitsOnly = event.target.value.replace(/\D/g, "");
              setRoomId(digitsOnly.slice(0, 6));
              setError("");
            }}
            disabled={loading}
          />

          {error && (
            <p className="home-error" role="alert">
              {error}
            </p>
          )}

          {/* BUTTONS */}
          <div className="home-buttons">
            <button
              type="button"
              className="create-room-button"
              onClick={handleCreateRoom}
              disabled={loading}
            >
              {loading ? "Please wait..." : "Create Room →"}
            </button>

            <button
              type="button"
              className="join-room-button"
              onClick={handleJoinRoom}
              disabled={loading}
            >
              {loading ? "Please wait..." : "Join Room"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Home;