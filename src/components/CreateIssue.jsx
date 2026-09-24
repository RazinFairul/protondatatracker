import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import imageCompression from 'browser-image-compression';

const DRAFT_STORAGE_KEY = 'draft_create_new_issue';

export default function CreateIssue({ userProfile, onBackToDashboard, onIssueCreated }) {
  const [whatIssue, setWhatIssue] = useState('');
  const [description, setDescription] = useState('');
  const [groupName, setGroupName] = useState('');
  const [location, setLocation] = useState('');
  const [engineVariant, setEngineVariant] = useState('');
  const [pic, setPic] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [classification, setClassification] = useState('');
  const [estimatedClosing, setEstimatedClosing] = useState('');
  const [file, setFile] = useState(null);

  // Multi-Link States
  const [linkList, setLinkList] = useState([]);
  const [tempLinkInput, setTempLinkInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Dynamic stations state
  const [stationList, setStationList] = useState([]);
  const [stationMode, setStationMode] = useState('select'); // 'select' | 'add' | 'delete'
  const [newStationCode, setNewStationCode] = useState('');
  const [stationToDelete, setStationToDelete] = useState('');
  const [stationLoading, setStationLoading] = useState(false);

  // Dynamic variants state
  const [variantList, setVariantList] = useState([]);
  const [variantMode, setVariantMode] = useState('select'); // 'select' | 'add' | 'delete'
  const [newVariantName, setNewVariantName] = useState('');
  const [variantToDelete, setVariantToDelete] = useState('');
  const [variantLoading, setVariantLoading] = useState(false);

  const fileInputRef = useRef(null);

  // 1. Pulihkan draf daripada localStorage semasa komponen mula dimuatkan
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed.whatIssue) setWhatIssue(parsed.whatIssue);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.groupName) setGroupName(parsed.groupName);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.engineVariant) setEngineVariant(parsed.engineVariant);
        if (parsed.pic) setPic(parsed.pic);
        if (parsed.dateTime) setDateTime(parsed.dateTime);
        if (parsed.classification) setClassification(parsed.classification);
        if (parsed.estimatedClosing) setEstimatedClosing(parsed.estimatedClosing);
        if (Array.isArray(parsed.linkList)) setLinkList(parsed.linkList);
        setHasRestoredDraft(true);
      } catch (err) {
        console.error('Failed to parse saved draft:', err);
      }
    }
  }, []);

  // 2. Simpan draf ke localStorage setiap kali ada medan teks yang berubah
  useEffect(() => {
    const draftPayload = {
      whatIssue,
      description,
      groupName,
      location,
      engineVariant,
      pic,
      dateTime,
      classification,
      estimatedClosing,
      linkList,
    };

    const hasAnyContent = Boolean(
      whatIssue ||
      description ||
      groupName ||
      location ||
      engineVariant ||
      pic ||
      dateTime ||
      classification ||
      estimatedClosing ||
      linkList.length > 0
    );

    if (hasAnyContent) {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftPayload));
    }
  }, [
    whatIssue,
    description,
    groupName,
    location,
    engineVariant,
    pic,
    dateTime,
    classification,
    estimatedClosing,
    linkList,
  ]);

  // Fungsi mengosongkan draf secara manual
  const handleClearDraft = () => {
    const confirmClear = window.confirm('Are you sure you want to clear this draft and reset all fields?');
    if (!confirmClear) return;

    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setWhatIssue('');
    setDescription('');
    setGroupName('');
    setLocation('');
    setEngineVariant('');
    setPic('');
    setDateTime('');
    setClassification('');
    setEstimatedClosing('');
    setLinkList([]);
    setTempLinkInput('');
    handleRemoveFile();
    setHasRestoredDraft(false);
  };

  // Fetch stations from Supabase table based on selected Group
  useEffect(() => {
    if (!groupName) {
      setStationList([]);
      setLocation('');
      setStationMode('select');
      return;
    }

    const fetchStations = async () => {
      setStationLoading(true);
      try {
        let query = supabase.from('stations').select('station_code, group_name');

        if (groupName !== 'IT') {
          query = query.eq('group_name', groupName);
        }

        const { data, error } = await query.order('station_code', { ascending: true });

        if (!error && data) {
          const uniqueStations = Array.from(new Set(data.map((item) => item.station_code))).sort();
          setStationList(uniqueStations);
        } else {
          setStationList([]);
        }
      } catch (err) {
        console.error('Failed to fetch stations:', err);
        setStationList([]);
      } finally {
        setStationLoading(false);
      }
    };

    fetchStations();
  }, [groupName]);

  // Fetch variants from Supabase table on load
  useEffect(() => {
    const fetchVariants = async () => {
      setVariantLoading(true);
      try {
        const { data, error } = await supabase
          .from('engine_variants')
          .select('variant_name')
          .order('variant_name', { ascending: true });

        if (!error && data) {
          const uniqueVariants = Array.from(new Set(data.map((item) => item.variant_name))).sort();
          setVariantList(uniqueVariants);
        } else {
          setVariantList([]);
        }
      } catch (err) {
        console.error('Failed to fetch variants:', err);
        setVariantList([]);
      } finally {
        setVariantLoading(false);
      }
    };

    fetchVariants();
  }, []);

  // Handle group change
  const handleGroupChange = (e) => {
    const selectedGroup = e.target.value;
    setGroupName(selectedGroup);
    setLocation('');
    setStationMode('select');
  };

  // Add new station to Supabase
  const handleAddNewStation = async () => {
    const trimmed = newStationCode.trim().toUpperCase();
    if (!trimmed) {
      alert('Please enter a station code.');
      return;
    }

    if (stationList.includes(trimmed)) {
      alert('This station already exists in the list.');
      return;
    }

    setStationLoading(true);
    const targetGroup = groupName || 'Assembly Line';

    const { error } = await supabase.from('stations').insert([
      { group_name: targetGroup, station_code: trimmed }
    ]);

    if (error) {
      alert('Failed to add station: ' + error.message);
    } else {
      const updated = [...stationList, trimmed].sort();
      setStationList(updated);
      setLocation(trimmed);
      setNewStationCode('');
      setStationMode('select');
    }
    setStationLoading(false);
  };

  // Delete station from Supabase
  const handleDeleteStation = async () => {
    if (!stationToDelete) {
      alert('Please select a station to delete.');
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete station "${stationToDelete}"?`
    );
    if (!confirmDelete) return;

    setStationLoading(true);
    let query = supabase.from('stations').delete().eq('station_code', stationToDelete);

    if (groupName !== 'IT') {
      query = query.eq('group_name', groupName);
    }

    const { error } = await query;

    if (error) {
      alert('Failed to delete station: ' + error.message);
    } else {
      const updated = stationList.filter((s) => s !== stationToDelete);
      setStationList(updated);
      if (location === stationToDelete) {
        setLocation('');
      }
      setStationToDelete('');
      setStationMode('select');
      alert(`Station "${stationToDelete}" has been deleted.`);
    }
    setStationLoading(false);
  };

  // Add new variant to Supabase
  const handleAddNewVariant = async () => {
    const trimmed = newVariantName.trim().toUpperCase();
    if (!trimmed) {
      alert('Please enter a variant name.');
      return;
    }

    if (variantList.includes(trimmed)) {
      alert('This variant already exists in the list.');
      return;
    }

    setVariantLoading(true);
    const { error } = await supabase.from('engine_variants').insert([
      { variant_name: trimmed }
    ]);

    if (error) {
      alert('Failed to add variant: ' + error.message);
    } else {
      const updated = [...variantList, trimmed].sort();
      setVariantList(updated);
      setEngineVariant(trimmed);
      setNewVariantName('');
      setVariantMode('select');
    }
    setVariantLoading(false);
  };

  // Delete variant from Supabase
  const handleDeleteVariant = async () => {
    if (!variantToDelete) {
      alert('Please select a variant to delete.');
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete variant "${variantToDelete}"?`
    );
    if (!confirmDelete) return;

    setVariantLoading(true);
    const { error } = await supabase
      .from('engine_variants')
      .delete()
      .eq('variant_name', variantToDelete);

    if (error) {
      alert('Failed to delete variant: ' + error.message);
    } else {
      const updated = variantList.filter((v) => v !== variantToDelete);
      setVariantList(updated);
      if (engineVariant === variantToDelete) {
        setEngineVariant('');
      }
      setVariantToDelete('');
      setVariantMode('select');
      alert(`Variant "${variantToDelete}" has been deleted.`);
    }
    setVariantLoading(false);
  };

  // Multi-Link Handlers
  const handleAddLink = () => {
    const trimmed = tempLinkInput.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch (_) {
      alert('Please enter a valid URL (e.g. https://...)');
      return;
    }
    setLinkList((prev) => [...prev, trimmed]);
    setTempLinkInput('');
  };

  const handleRemoveLink = (idxToRemove) => {
    setLinkList((prev) => prev.filter((_, idx) => idx !== idxToRemove));
  };

  // Remove selected file attachment
  const handleRemoveFile = () => {
    setFile(null);
    setCompressing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle file selection and automatic image compression
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (selectedFile.type.startsWith('image/')) {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      };

      try {
        setCompressing(true);
        const compressedBlob = await imageCompression(selectedFile, options);
        const compressedFile = new File([compressedBlob], selectedFile.name, {
          type: selectedFile.type,
          lastModified: Date.now(),
        });
        setFile(compressedFile);
      } catch (error) {
        console.error('Image compression failed, using original file:', error);
        setFile(selectedFile);
      } finally {
        setCompressing(false);
      }
    } else {
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (compressing) {
      alert('Please wait, image is still being compressed...');
      return;
    }

    setLoading(true);

    try {
      // Gunakan maklumat daripada userProfile atau tetapkan nilai lalai staff
      const autoStaffName = userProfile?.full_name || pic || 'Staff';
      const staffEmail = 'staff@proton.com';
      const staffIdVal = userProfile?.staff_id || 'STAFF-ME';
      let fileUrl = null;

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('issue-attachments')
          .upload(filePath, file);

        if (uploadError) {
          throw new Error('File upload failed: ' + uploadError.message);
        }

        const { data: urlData } = supabase.storage
          .from('issue-attachments')
          .getPublicUrl(filePath);

        fileUrl = urlData.publicUrl;
      }

      // Initialise progress matrix with linkList mapped to Phase 1/4
      const initialProgressMatrix = {
        root_cause: '',
        countermeasure: '',
        '1/4': {
          progress: '',
          remark: '',
          links: linkList
        },
        '2/4': { progress: '', remark: '', links: [] },
        '3/4': { progress: '', remark: '', links: [] },
        '4/4': { progress: '', remark: '', links: [] }
      };

      const { error: insertError } = await supabase.from('issues').insert([
        {
          what_issue: whatIssue,
          description: description,
          group_name: groupName,
          location: location.trim() || null,
          engine_variant: engineVariant.trim() || null,
          pic: pic,
          pic_name: pic,
          pic_email: staffEmail,
          date_time: dateTime || null,
          classification: classification,
          estimated_closing: estimatedClosing,
          staff_name: autoStaffName,
          staff_id: staffIdVal,
          file_url: fileUrl,
          onedrive_link: linkList.length > 0 ? linkList[0] : null,
          progress_matrix: initialProgressMatrix,
          user_id: null,
          user_email: staffEmail,
          status: 'In Progress (1/4)',
        },
      ]);

      if (insertError) {
        throw insertError;
      }

      // 3. Padam draf setelah rekod berjaya dimasukkan ke Supabase
      localStorage.removeItem(DRAFT_STORAGE_KEY);

      alert('Issue submitted successfully!');

      if (onIssueCreated) {
        onIssueCreated();
      } else if (onBackToDashboard) {
        onBackToDashboard();
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '10px 20px 30px', maxWidth: '600px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#0d3b66', margin: 0 }}>Open Issue</h2>
        {hasRestoredDraft && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#0284c7', backgroundColor: '#e0f2fe', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
              📝 Draft Loaded
            </span>
            <button
              type="button"
              onClick={handleClearDraft}
              style={{
                background: 'none',
                border: 'none',
                color: '#dc2626',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 'bold',
                textDecoration: 'underline'
              }}
            >
              Clear Draft
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
        {/* What the Issue */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>What the Issue:</label>
          <input 
            type="text" 
            value={whatIssue} 
            onChange={(e) => setWhatIssue(e.target.value)} 
            required
            placeholder="Enter the Issue"
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        {/* Description */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Description:</label>
          <textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            rows="4" 
            required
            placeholder="Enter a Description" 
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        {/* Group Dropdown */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Group:</label>
          <select
            required
            value={groupName}
            onChange={handleGroupChange}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ccc',
              boxSizing: 'border-box',
              backgroundColor: '#fff',
              cursor: 'pointer',
              color: groupName ? '#000' : '#888',
              fontSize: '16px'
            }}
          >
            <option value="" disabled hidden>Choose Group</option>
            <option value="Assembly Line" style={{ color: '#000' }}>Assembly Line</option>
            <option value="Test Line" style={{ color: '#000' }}>Test Line</option>
            <option value="7DCT" style={{ color: '#000' }}>7DCT</option>
            <option value="EDU & DHT" style={{ color: '#000' }}>EDU & DHT</option>
            <option value="IT" style={{ color: '#000' }}>IT (All Stations)</option>
          </select>
        </div>

        {/* Station Field */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>Station:</label>
            {groupName && (
              <div style={{ display: 'flex', gap: '10px' }}>
                {stationMode !== 'select' ? (
                  <button
                    type="button"
                    onClick={() => setStationMode('select')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textDecoration: 'underline'
                    }}
                  >
                    ← Back to select
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setStationMode('add')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#2563eb',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textDecoration: 'underline'
                      }}
                    >
                      + Add Station
                    </button>
                    <span style={{ color: '#cbd5e1' }}>|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setStationToDelete(location || '');
                        setStationMode('delete');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textDecoration: 'underline'
                      }}
                    >
                      🗑️ Delete Station
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {stationMode === 'add' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Example: STN700M / STN700A-C"
                value={newStationCode}
                onChange={(e) => setNewStationCode(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #2563eb',
                  boxSizing: 'border-box',
                  textTransform: 'uppercase',
                  fontSize: '16px'
                }}
              />
              <button
                type="button"
                onClick={handleAddNewStation}
                disabled={stationLoading}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {stationLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          {stationMode === 'delete' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={stationToDelete}
                onChange={(e) => setStationToDelete(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #dc2626',
                  boxSizing: 'border-box',
                  backgroundColor: '#fff',
                  color: stationToDelete ? '#000' : '#888',
                  fontSize: '16px'
                }}
              >
                <option value="">-- Choose station to remove --</option>
                {stationList.map((stn) => (
                  <option key={stn} value={stn} style={{ color: '#000' }}>
                    {stn}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDeleteStation}
                disabled={stationLoading || !stationToDelete}
                style={{
                  padding: '10px 14px',
                  backgroundColor: !stationToDelete ? '#fca5a5' : '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  fontWeight: 'bold',
                  cursor: !stationToDelete ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {stationLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          )}

          {stationMode === 'select' && (
            <select
              value={location}
              disabled={!groupName || stationLoading}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                boxSizing: 'border-box',
                backgroundColor: !groupName ? '#f8fafc' : '#fff',
                color: location ? '#000' : '#888',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              <option value="">
                {!groupName
                  ? 'Please select Group first'
                  : stationLoading
                  ? 'Loading stations...'
                  : `-- Select Station (${stationList.length} available) --`}
              </option>
              {stationList.map((stn) => (
                <option key={stn} value={stn} style={{ color: '#000' }}>
                  {stn}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Variant Field */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>Variant:</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {variantMode !== 'select' ? (
                <button
                  type="button"
                  onClick={() => setVariantMode('select')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textDecoration: 'underline'
                  }}
                >
                  ← Back to select
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setVariantMode('add')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textDecoration: 'underline'
                    }}
                  >
                    + Add Variant
                  </button>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setVariantToDelete(engineVariant || '');
                      setVariantMode('delete');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textDecoration: 'underline'
                    }}
                  >
                    🗑️ Delete Variant
                  </button>
                </>
              )}
            </div>
          </div>

          {variantMode === 'add' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Example: CFN-000 / AFD-A09"
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #2563eb',
                  boxSizing: 'border-box',
                  textTransform: 'uppercase',
                  fontSize: '16px'
                }}
              />
              <button
                type="button"
                onClick={handleAddNewVariant}
                disabled={variantLoading}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {variantLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          {variantMode === 'delete' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={variantToDelete}
                onChange={(e) => setVariantToDelete(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #dc2626',
                  boxSizing: 'border-box',
                  backgroundColor: '#fff',
                  color: variantToDelete ? '#000' : '#888',
                  fontSize: '16px'
                }}
              >
                <option value="">-- Choose variant to remove --</option>
                {variantList.map((v) => (
                  <option key={v} value={v} style={{ color: '#000' }}>
                    {v}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDeleteVariant}
                disabled={variantLoading || !variantToDelete}
                style={{
                  padding: '10px 14px',
                  backgroundColor: !variantToDelete ? '#fca5a5' : '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  fontWeight: 'bold',
                  cursor: !variantToDelete ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {variantLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          )}

          {variantMode === 'select' && (
            <select
              value={engineVariant}
              disabled={variantLoading}
              onChange={(e) => setEngineVariant(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                boxSizing: 'border-box',
                backgroundColor: '#fff',
                color: engineVariant ? '#000' : '#888',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              <option value="">
                {variantLoading
                  ? 'Loading variants...'
                  : `-- Select Variant (${variantList.length} available) --`}
              </option>
              {variantList.map((v) => (
                <option key={v} value={v} style={{ color: '#000' }}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Person in Charge (PIC) */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Person in Charge (PIC):</label>
          <input 
            type="text" 
            value={pic} 
            onChange={(e) => setPic(e.target.value)} 
            required 
            placeholder="Enter Person in Charge"
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '16px' }}
          />
        </div>

        {/* Time and Date */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Time and Date:</label>
          <input 
            type="datetime-local" 
            value={dateTime} 
            onChange={(e) => setDateTime(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '16px' }}
          />
        </div>

        {/* Issue Classification */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Issue Classification:</label>
          <select 
            required
            value={classification} 
            onChange={(e) => setClassification(e.target.value)} 
            style={{ 
              width: '100%', 
              padding: '10px', 
              borderRadius: '5px', 
              border: '1px solid #ccc', 
              boxSizing: 'border-box', 
              backgroundColor: '#fff', 
              cursor: 'pointer', 
              color: classification ? '#000' : '#888', 
              fontSize: '16px' 
            }}
          >
            <option value="" disabled hidden>Choose Issue Classification</option>
            <option value="A" style={{ color: '#000' }}>Class A - Safety / Quality Issue / Government Issue / Without Temporary Countermeasure</option>
            <option value="B" style={{ color: '#000' }}>Class B - Cause to Breakdown / Downtime Production / With Temporary Countermeasure</option>
            <option value="C" style={{ color: '#000' }}>Class C - Minor Issue / Improvement</option>
          </select>
        </div>

        {/* Estimated Time of Closing */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Estimated Time of Closing Issue:</label>
          <input 
            type="date" 
            value={estimatedClosing} 
            onChange={(e) => setEstimatedClosing(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '16px' }}
          />
        </div>

        {/* File Uploads with Cancel Button */}
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>File Uploads:</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*,video/*,.pdf,.doc,.docx"
              onChange={handleFileChange} 
              style={{ 
                flex: 1, 
                padding: '8px', 
                borderRadius: '5px', 
                border: '1px solid #ccc', 
                boxSizing: 'border-box', 
                backgroundColor: '#fff' 
              }}
            />
            {file && (
              <button
                type="button"
                onClick={handleRemoveFile}
                title="Cancel and remove selected file"
                style={{
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  borderRadius: '5px',
                  padding: '8px 12px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap'
                }}
              >
                ✕ Cancel
              </button>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', flexWrap: 'wrap', gap: '4px' }}>
            <small style={{ color: '#666' }}>Max: 50 MB (Images will be automatically compressed)</small>
            {compressing && <span style={{ color: '#0284c7', fontWeight: 'bold' }}>⏳ Compressing image...</span>}
            {!compressing && file && file.type.startsWith('image/') && (
              <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓ {(file.size / 1024).toFixed(0)} KB ready</span>
            )}
          </div>
        </div>

        {/* Multi-Link Attachment Section */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', backgroundColor: '#f8fafc' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#1e293b' }}>
            🔗 Attachment Links:
          </label>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input 
              type="url" 
              value={tempLinkInput} 
              onChange={(e) => setTempLinkInput(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLink();
                }
              }}
              placeholder="Paste Link" 
              style={{ flex: 1, padding: '9px 12px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '14px', backgroundColor: '#fff' }}
            />
            <button
              type="button"
              onClick={handleAddLink}
              style={{
                padding: '9px 16px',
                backgroundColor: '#0d3b66',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              + Add Link
            </button>
          </div>

          <small style={{ color: '#64748b', display: 'block', marginBottom: '8px' }}>
            *Recommended for large files or videos exceeding standard storage limits.
          </small>

          {/* List of Added Links */}
          {linkList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {linkList.map((lnk, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#fff',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1'
                  }}
                >
                  <a
                    href={lnk}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}
                  >
                    🔗 Link {idx + 1}: {lnk}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(idx)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                    title="Remove link"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          type="submit" 
          disabled={loading || compressing}
          style={{ 
            padding: '12px', 
            backgroundColor: loading || compressing ? '#94a3b8' : '#0d3b66', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '5px', 
            fontWeight: 'bold', 
            fontSize: '16px', 
            cursor: loading || compressing ? 'not-allowed' : 'pointer', 
            marginTop: '10px' 
          }}
        >
          {loading ? 'Submitting...' : compressing ? 'Optimizing Image...' : 'Submit Issue'}
        </button>
      </form>
    </div>
  );
}