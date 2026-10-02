import axios from "axios";

const api = axios.create({
  baseURL: "http://13.50.238.160:8005",
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;