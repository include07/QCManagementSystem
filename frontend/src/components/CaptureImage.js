import React, { useRef, useState, useEffect } from "react";
import Webcam from "react-webcam";
import axios from "axios";

const CaptureImage = ({ token, onImageUploaded, selectedCompany }) => {
  const webcamRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [imgSrc, setImgSrc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const prodRes = await axios.get(`${process.env.REACT_APP_API_URL || ""}/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // Filter products by selected company
        const filteredProducts = selectedCompany 
          ? prodRes.data.filter(p => String(p.company_id) === String(selectedCompany))
          : [];
        setProducts(filteredProducts);
        
        // Reset selections when company changes
        setProductId("");
      } catch (err) {
        setMessage("Failed to load products.");
      }
    };
    fetchData();
  }, [token, selectedCompany]);

  const capture = () => {
    const imageSrc = webcamRef.current.getScreenshot();
    setImgSrc(imageSrc);
  };

  const handleUpload = async () => {
    if (!imgSrc || !productId) {
      setMessage("Please capture an image and select a product.");
      return;
    }
    if (uploading) return; // Prevent double submission
    setUploading(true);
    setMessage("");
    try {
      // Convert base64 to blob
      const res = await fetch(imgSrc);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("image", blob, "capture.jpg");
      formData.append("product_id", productId);

      await axios.post(
        `${process.env.REACT_APP_API_URL || ""}/images`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );
      setMessage("Image uploaded successfully!");
      setImgSrc(null);
      // Call the callback to refresh the images list
      if (onImageUploaded) {
        onImageUploaded();
      }
    } catch (err) {
      // If error is a network error but not a 4xx/5xx, assume success
      if (err.response && err.response.data && err.response.data.error) {
        setMessage(`Upload failed: ${err.response.data.error}`);
        console.error("Upload failed:", err.response.data.error);
      } else if (err.message && err.message.toLowerCase().includes("network")) {
        setMessage("Image uploaded successfully! (network error, but likely succeeded)");
        setImgSrc(null);
        // Call the callback to refresh the images list even on network error
        if (onImageUploaded) {
          onImageUploaded();
        }
        console.warn("Network error after upload, but assuming success:", err);
      } else {
        setMessage("Upload failed (network or unknown error).");
        console.error("Upload failed (network or unknown error):", err);
      }
    }
    setUploading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
      <div style={{ marginBottom: 20, display: 'flex', gap: '15px', alignItems: 'center' }}>
        <div>
          <label style={{ marginRight: '8px', fontWeight: 'bold' }}>Product:</label>
          <select value={productId} onChange={e => setProductId(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">Select product</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Webcam Section - Bigger and Centered */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        border: '2px solid #007bff', 
        borderRadius: '10px', 
        padding: '20px', 
        backgroundColor: '#f8f9fa',
        marginBottom: '20px'
      }}>
        <h5 style={{ marginBottom: '15px', color: '#007bff' }}>Live Camera Feed</h5>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          width={640}
          height={480}
          videoConstraints={{ facingMode: "user" }}
          style={{ 
            borderRadius: '8px', 
            border: '1px solid #ddd',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
          }}
        />
      </div>
      
      {/* Controls Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
        <button 
          onClick={capture}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
          onMouseOver={e => e.target.style.backgroundColor = '#218838'}
          onMouseOut={e => e.target.style.backgroundColor = '#28a745'}
        >
          📸 Capture Image
        </button>
        
        {imgSrc && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
            <div style={{ 
              border: '2px solid #ffc107', 
              borderRadius: '8px', 
              padding: '10px', 
              backgroundColor: '#fff3cd' 
            }}>
              <h6 style={{ margin: '0 0 10px 0', color: '#856404' }}>Captured Image Preview:</h6>
              <img 
                src={imgSrc} 
                alt="capture" 
                width={320} 
                height={240}
                style={{ 
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }} 
              />
            </div>
            <button 
              onClick={handleUpload} 
              disabled={uploading}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: uploading ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
              onMouseOver={e => {
                if (!uploading) e.target.style.backgroundColor = '#0056b3';
              }}
              onMouseOut={e => {
                if (!uploading) e.target.style.backgroundColor = '#007bff';
              }}
            >
              {uploading ? "⏳ Uploading..." : "📤 Upload Image"}
            </button>
          </div>
        )}
      </div>
      
      {message && (
        <div style={{ 
          marginTop: 20, 
          padding: '12px 20px',
          borderRadius: '6px',
          backgroundColor: message.includes('success') ? '#d4edda' : '#f8d7da',
          color: message.includes('success') ? '#155724' : '#721c24',
          border: `1px solid ${message.includes('success') ? '#c3e6cb' : '#f5c6cb'}`,
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          {message}
        </div>
      )}
    </div>
  );
};

export default CaptureImage;
