import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import AuthContext from "../context/AuthContext";
import CaptureImage from "../components/CaptureImage";
import { downloadAllImages } from "../services/api";

const ImageManagerPage = () => {
  const { auth } = useContext(AuthContext);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [images, setImages] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL || ""}/companies`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        setCompanies(res.data);
      } catch (err) {
        setMessage("Failed to load companies.");
      }
    };
    fetchCompanies();
  }, [auth.token]);

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    const fetchData = async () => {
      try {
        const [imgRes, prodRes] = await Promise.all([
          axios.get(`${process.env.REACT_APP_API_URL || ""}/companies/${selectedCompany}/images`, {
            headers: { Authorization: `Bearer ${auth.token}` },
          }),
          axios.get(`${process.env.REACT_APP_API_URL || ""}/products`, {
            headers: { Authorization: `Bearer ${auth.token}` },
          }),
        ]);
        setImages(imgRes.data);
        setProducts(prodRes.data.filter(p => String(p.company_id) === String(selectedCompany)));
      } catch (err) {
        setMessage("Failed to load images/products.");
      }
      setLoading(false);
    };
    fetchData();
  }, [selectedCompany, auth.token]);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this image?")) return;
    try {
      await axios.delete(`${process.env.REACT_APP_API_URL || ""}/images/${id}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      setImages(images.filter(img => img.id !== id));
    } catch (err) {
      setMessage("Failed to delete image.");
    }
  };

  const refreshImages = async () => {
    if (!selectedCompany) return;
    try {
      const imgRes = await axios.get(`${process.env.REACT_APP_API_URL || ""}/companies/${selectedCompany}/images`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      console.log('Images data:', imgRes.data); // Debug log
      setImages(imgRes.data);
    } catch (err) {
      setMessage("Failed to refresh images.");
    }
  };

  const handleDownloadAll = async () => {
    setMessage("Preparing download...");
    const result = await downloadAllImages();
    if (result.success) {
      setMessage("Download started successfully!");
      setTimeout(() => setMessage(""), 3000);
    } else {
      setMessage(`Download failed: ${result.error}`);
    }
  };

  // Group images by product for easier management
  const groupedImages = images
    .filter(img => {
      const prod = products.find(p => String(p.id) === String(img.product_id));
      return prod;
    })
    .reduce((groups, img) => {
      const key = `${img.product_id}`;
      if (!groups[key]) {
        const prod = products.find(p => String(p.id) === String(img.product_id));
        groups[key] = {
          productId: img.product_id,
          productName: prod.name,
          images: []
        };
      }
      groups[key].images.push(img);
      return groups;
    }, {});

  return (
    <div>
      <h2>Image Manager</h2>
      <div style={{ marginBottom: 10 }}>
        <label>Company: </label>
        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
          <option value="">Select company</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {selectedCompany && (
        <>
          <h4>Add New Image</h4>
          <CaptureImage token={auth.token} onImageUploaded={refreshImages} selectedCompany={selectedCompany} />
          
          <div style={{ marginTop: 20, marginBottom: 20 }}>
            <h4>Download Options</h4>
            <button 
              onClick={handleDownloadAll} 
              style={{ 
                backgroundColor: '#007bff', 
                color: 'white', 
                border: 'none', 
                padding: '10px 20px', 
                borderRadius: '5px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Download All Images (ZIP)
            </button>
            <span style={{ fontSize: '14px', color: '#666' }}>
              Downloads all images from all companies, organized by folders
            </span>
          </div>
          
          <h4 className="mt-4">Existing Images by Product</h4>
          {loading ? <div>Loading...</div> : (
            <div>
              {Object.keys(groupedImages).length === 0 ? <div>No images found.</div> : (
                <div>
                  {Object.values(groupedImages).map(group => (
                    <div key={`${group.productId}`} style={{ 
                      border: "2px solid #007bff", 
                      margin: "20px 0", 
                      padding: "15px", 
                      borderRadius: "8px",
                      backgroundColor: "#f8f9fa"
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '15px'
                      }}>
                        <h5 style={{ margin: 0 }}>
                          <span style={{ color: '#007bff' }}>Product:</span> {group.productName}
                          <span style={{ marginLeft: '15px', fontSize: '14px', color: '#666' }}>
                            ({group.images.length} image{group.images.length !== 1 ? 's' : ''})
                          </span>
                        </h5>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap" }}>
                        {group.images.map(img => (
                          <div key={img.id} style={{ 
                            border: "1px solid #ddd", 
                            margin: 8, 
                            padding: 8, 
                            width: 220,
                            borderRadius: "5px",
                            backgroundColor: "white"
                          }}>
                            <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                              {img.filename}
                            </div>
                            {img.access_url ? (
                              <img 
                                src={img.access_url} 
                                alt="img" 
                                style={{ width: 180, height: 120, objectFit: "cover", borderRadius: "3px" }}
                                onError={(e) => {
                                  console.error('Image failed to load:', img.access_url);
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'block';
                                }}
                                onLoad={() => {
                                  console.log('Image loaded successfully:', img.access_url);
                                }}
                              />
                            ) : null}
                            <div style={{ 
                              display: 'none', 
                              width: 180, 
                              height: 120, 
                              backgroundColor: '#f0f0f0', 
                              textAlign: 'center', 
                              lineHeight: '120px', 
                              fontSize: '12px',
                              borderRadius: "3px"
                            }}>
                              Image not available
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <button 
                                onClick={() => handleDelete(img.id)} 
                                style={{ 
                                  color: "white", 
                                  backgroundColor: "#dc3545",
                                  border: "none",
                                  padding: "5px 10px",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  fontSize: "12px"
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {message && (
        <div style={{ 
          marginTop: 10, 
          padding: '10px', 
          borderRadius: '5px',
          backgroundColor: message.includes('failed') || message.includes('Failed') ? '#f8d7da' : '#d4edda',
          color: message.includes('failed') || message.includes('Failed') ? '#721c24' : '#155724',
          border: message.includes('failed') || message.includes('Failed') ? '1px solid #f5c6cb' : '1px solid #c3e6cb'
        }}>
          {message}
        </div>
      )}
    </div>
  );
};

export default ImageManagerPage;
