import React, { useContext } from "react";
import CaptureImage from "../components/CaptureImage";
import AuthContext from "../context/AuthContext";

const ImageCapturePage = () => {
  const { auth } = useContext(AuthContext);
  return (
    <div>
      <h2>Capture and Upload Image</h2>
      <CaptureImage token={auth.token} />
    </div>
  );
};

export default ImageCapturePage;
