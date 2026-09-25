import {
  useState
} from "react";

import {
  useNavigate
} from "react-router-dom";

import { getRoomHistoryApi } from "../api/roomApi";

function JoinRoom() {

  const navigate = useNavigate();

  const [roomId, setRoomId] =
    useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);


  const handleJoinRoom = async () => {

    setError("");

    if (!roomId.trim()) {

      setError(
        "Please enter a Room ID"
      );

      return;
    }

    try {

      setLoading(true);

      const response =
      await getRoomHistoryApi(roomId);

      navigate(
        `/room/${response.room_id}`
      );

    } catch (error) {

      setError(
        error.response?.data?.detail ||
        "Room not found"
      );

    } finally {

      setLoading(false);

    }
  };


  return (

    <div className="home-page">

      <div className="home-container">

        <img
          src="/quick-share-logo.png"
          alt="Quick Share"
          className="home-logo"
        />


        <h1>
          Join Room
        </h1>


        <div className="room-form">

          <label>
            Room ID
          </label>


          <input
            type="text"
            placeholder="Example: ABC123"
            value={roomId}
            onChange={(event) =>
              setRoomId(
                event.target.value.toUpperCase()
              )
            }
          />


          {error && (
            <p className="error-message">
              {error}
            </p>
          )}


          <button
            className="create-button"
            onClick={handleJoinRoom}
            disabled={loading}
          >
            {loading
              ? "Joining..."
              : "Join Room"
            }
          </button>

        </div>

      </div>

    </div>
  );
}


export default JoinRoom;