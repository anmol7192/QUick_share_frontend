import axios from "axios";

const API_URL = "http://192.168.1.120:8000";

// =========================================================
// CREATE ROOM
// =========================================================

export const createRoomApi = async (roomId) => {
  return axios.post(`${API_URL}/room`, {
    room_id: roomId,
    action: "create",
  });
};

// =========================================================
// JOIN ROOM
// =========================================================

export const joinRoomApi = async (roomId) => {
  return axios.post(`${API_URL}/room`, {
    room_id: roomId,
    action: "join",
  });
};

// =========================================================
// GET HISTORY
// =========================================================

export const getRoomHistoryApi = async (
  roomId,
  sessionToken
) => {
  return axios.get(
    `${API_URL}/history/${roomId}`,
    {
      params: {
        session_token: sessionToken,
      },
    }
  );
};

// =========================================================
// FILE → BASE64
// =========================================================

const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => {

      try {

        const result = reader.result;

       

        const base64 = result.split(",")[1];

        resolve(base64);

      } catch (error) {

        reject(error);

      }

    };

    reader.onerror = () => {

      reject(
        new Error("Could not read file")
      );

    };

    reader.readAsDataURL(file);

  });
};

// =========================================================
// UPLOAD FILE
// =========================================================

export const uploadFileApi = async (
  roomId,
  sessionToken,
  file
) => {

  // 1. Convert file to Base64
  const base64Data =
    await fileToBase64(file);

  // 2. Prepare form data
  const formData =
    new URLSearchParams();

  formData.append(
    "room_id",
    roomId
  );

  formData.append(
    "session_token",
    sessionToken
  );

  formData.append(
    "filename",
    file.name
  );

  formData.append(
    "content_type",
    file.type ||
      "application/octet-stream"
  );

  formData.append(
    "file_data",
    base64Data
  );

  // 3. Upload
  return axios.post(
    `${API_URL}/upload`,
    formData,
    {
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
    }
  );

};