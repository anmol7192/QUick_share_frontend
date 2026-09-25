import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import Home from "./pages/Home";
import JoinRoom from "./pages/JoinRoom";
import ChatRoom from "./pages/ChatRoom";


function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/join"
          element={<JoinRoom />}
        />

        <Route
          path="/room/:roomId"
          element={<ChatRoom />}
        />

      </Routes>

    </BrowserRouter>
  );
}


export default App;