import React, { useEffect, useState, useMemo, useRef } from 'react';
import XLSX from 'xlsx-js-style';
import { supabase } from '../supabaseClient';

const STAGE_ORDER = {
  'In Progress (1/4)': 1,
  'In Progress (2/4)': 2,
  'In Progress (3/4)': 3,
  'Closed (4/4)': 4,
  'Closed': 4
};

const DEFAULT_STAGES = {
  '1/4': { progress: '', remark: '', links: [] },
  '2/4': { progress: '', remark: '', links: [] },
  '3/4': { progress: '', remark: '', links: [] },
  '4/4': { progress: '', remark: '', links: [] }
};

export default function IssueList({ onBackToDashboard, refreshTrigger }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Master Data
  const [dbStations, setDbStations] = useState([]);
  const [dbVariants, setDbVariants] = useState([]);

  // Filters: Date - Status - Class - Group - Location - Variant - Name
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [classificationFilter, setClassificationFilter] = useState('All');
  const [groupFilter, setGroupFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [engineVariantFilter, setEngineVariantFilter] = useState('All');
  const [nameFilter, setNameFilter] = useState('All');

  // Est. Closing Inline Edit
  const [editingEstClosingId, setEditingEstClosingId] = useState(null);
  const [newEstClosingDate, setNewEstClosingDate] = useState('');
  const [savingEstDate, setSavingEstDate] = useState(false);

  // Update Modal State
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [modalStatus, setModalStatus] = useState('In Progress (1/4)');
  const [rootCause, setRootCause] = useState('');
  const [countermeasure, setCountermeasure] = useState('');
  const [stageDetails, setStageDetails] = useState(DEFAULT_STAGES);
  const [activeStageTab, setActiveStageTab] = useState('2/4');
  const [tempLinkInput, setTempLinkInput] = useState('');
  const [updating, setUpdating] = useState(false);
  const [hasRestoredModalDraft, setHasRestoredModalDraft] = useState(false);

  const deepLinkProcessedRef = useRef(false);

  const clearDeepLinkUrl = () => {
    localStorage.removeItem('open_issue_id');
    if (window.location.search.includes('issueId')) {
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    }
  };

  const fetchMasterData = async () => {
    try {
      const [stationsRes, variantsRes] = await Promise.all([
        supabase.from('stations').select('station_code, group_name').order('station_code', { ascending: true }),
        supabase.from('engine_variants').select('variant_name').order('variant_name', { ascending: true })
      ]);

      if (!stationsRes.error && stationsRes.data) {
        setDbStations(stationsRes.data);
      }
      if (!variantsRes.error && variantsRes.data) {
        setDbVariants(variantsRes.data.map((v) => v.variant_name));
      }
    } catch (err) {
      console.error('Failed to fetch master dropdown data:', err);
    }
  };

  const fetchIssues = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .order('date_time', { ascending: false });

    if (error) {
      alert('Error fetching issues: ' + error.message);
    } else {
      setIssues(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchIssues();
    fetchMasterData();
  }, [refreshTrigger]);

  // Auto-save update draft to localStorage
  useEffect(() => {
    if (!selectedIssue) return;

    const draftPayload = {
      modalStatus,
      rootCause,
      countermeasure,
      stageDetails,
      activeStageTab
    };

    localStorage.setItem(`draft_update_${selectedIssue.id}`, JSON.stringify(draftPayload));
  }, [selectedIssue, modalStatus, rootCause, countermeasure, stageDetails, activeStageTab]);

  const handleGroupFilterChange = (e) => {
    setGroupFilter(e.target.value);
    setLocationFilter('All');
  };

  const getWeekOfMonth = (dateString) => {
    if (!dateString) return null;
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return null;
    const dayOfMonth = dateObj.getDate();
    return String(Math.min(5, Math.ceil(dayOfMonth / 7)));
  };

  const periodOptions = useMemo(() => {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const monthsSet = new Set();
    issues.forEach((i) => {
      const raw = i.date_time || i.created_at;
      if (raw) {
        const ym = raw.split('T')[0].slice(0, 7);
        if (ym.length === 7) monthsSet.add(ym);
      }
    });

    const nowYM = new Date().toISOString().slice(0, 7);
    monthsSet.add(nowYM);

    return Array.from(monthsSet).sort().reverse().map((ym) => {
      const [year, month] = ym.split('-');
      const monthLabel = `${monthNames[parseInt(month, 10) - 1]} ${year}`;
      return {
        key: ym,
        label: monthLabel,
        weeks: [
          { value: `${ym}-W1`, label: `${monthLabel} - Week 1 (1-7)` },
          { value: `${ym}-W2`, label: `${monthLabel} - Week 2 (8-14)` },
          { value: `${ym}-W3`, label: `${monthLabel} - Week 3 (15-21)` },
          { value: `${ym}-W4`, label: `${monthLabel} - Week 4 (22-28)` },
          { value: `${ym}-W5`, label: `${monthLabel} - Week 5 (29+)` },
        ]
      };
    });
  }, [issues]);

  const filteredLocationOptions = useMemo(() => {
    let list = [];
    if (groupFilter === 'All' || groupFilter === 'IT') {
      list = dbStations.map((s) => s.station_code);
    } else {
      list = dbStations
        .filter((s) => s.group_name === groupFilter)
        .map((s) => s.station_code);
    }

    return Array.from(new Set(list.filter(Boolean))).sort();
  }, [dbStations, groupFilter]);

  const uniqueEngineVariants = useMemo(() => {
    const fromIssues = issues.map((i) => i.engine_variant).filter(Boolean);
    return Array.from(new Set([...dbVariants, ...fromIssues])).sort();
  }, [dbVariants, issues]);

  const uniqueNames = useMemo(() => {
    return Array.from(new Set(issues.map((i) => i.staff_name || i.staff_id).filter(Boolean))).sort();
  }, [issues]);

  // Tiada sekatan login: Semua pengguna dibenarkan mengedit / memadam
  const checkCanEdit = () => {
    return true;
  };

  const handleDeleteIssue = async (issue) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete "${issue.what_issue || 'this issue'}"?`);
    if (!confirmDelete) return;

    setIssues((prev) => prev.filter((item) => item.id !== issue.id));

    if (issue.file_url && issue.file_url.includes('/issue-attachments/')) {
      try {
        const cleanPath = decodeURIComponent(issue.file_url.split('/issue-attachments/')[1].split('?')[0]);
        await supabase.storage.from('issue-attachments').remove([cleanPath]);
      } catch (err) {
        console.warn('Storage delete warning:', err);
      }
    }

    const { error } = await supabase.from('issues').delete().eq('id', issue.id);
    if (error) {
      alert('Failed to delete issue: ' + error.message);
      fetchIssues();
    } else {
      localStorage.removeItem(`draft_update_${issue.id}`);
      clearDeepLinkUrl();
      alert('Issue deleted successfully!');
    }
  };

  const handleSaveEstClosing = async (issueId) => {
    if (!newEstClosingDate) {
      setEditingEstClosingId(null);
      return;
    }

    setSavingEstDate(true);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('issues')
      .update({ estimated_closing: newEstClosingDate, updated_at: now })
      .eq('id', issueId);

    if (error) {
      alert('Failed to update Est. Closing date: ' + error.message);
    } else {
      setIssues((prev) =>
        prev.map((item) => item.id === issueId ? { ...item, estimated_closing: newEstClosingDate, updated_at: now } : item)
      );
      setEditingEstClosingId(null);
      setNewEstClosingDate('');
    }
    setSavingEstDate(false);
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '-';
    const cleanStr = dateTimeStr.replace('T', ' ');
    const [datePart, timePart] = cleanStr.split(' ');

    if (datePart && datePart.includes('-')) {
      const [year, month, day] = datePart.split('-');
      let formattedTime = '';
      if (timePart) {
        const [h, m] = timePart.split(':');
        const hour = parseInt(h, 10);
        if (!isNaN(hour)) {
          formattedTime = `, ${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
        }
      }
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year.slice(-2)}${formattedTime}`;
    }
    return dateTimeStr;
  };

  const formatDateOnly = (dateStr) => {
    if (!dateStr) return '-';
    const clean = dateStr.split('T')[0].split(' ')[0];
    if (clean && clean.includes('-')) {
      const [year, month, day] = clean.split('-');
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year.slice(-2)}`;
    }
    return dateStr;
  };

  const getStatusDetails = (status) => {
    switch (status) {
      case 'In Progress (1/4)':
        return { icon: '◔', text: 'In Progress (1/4)', bg: '#ea580c', color: '#fff' };
      case 'In Progress (2/4)':
        return { icon: '◑', text: 'In Progress (2/4)', bg: '#eab308', color: '#000' };
      case 'In Progress (3/4)':
        return { icon: '◕', text: 'In Progress (3/4)', bg: '#0284c7', color: '#fff' };
      case 'Closed':
      case 'Closed (4/4)':
      case 'Completed':
      case 'Complete':
        return { icon: '⚫', text: 'Closed (4/4)', bg: '#16a34a', color: '#fff' };
      default:
        return { icon: '◔', text: 'In Progress (1/4)', bg: '#ea580c', color: '#fff' };
    }
  };

  // Load issue data into modal
  const loadOriginalIssueData = (issue) => {
    let cur = issue.status || 'In Progress (1/4)';
    if (cur === 'Open') cur = 'In Progress (1/4)';
    if (cur === 'Completed' || cur === 'Complete' || cur === 'Closed') {
      cur = 'Closed (4/4)';
    }
    setModalStatus(cur);

    const matrix = issue.progress_matrix && typeof issue.progress_matrix === 'object' ? issue.progress_matrix : {};

    setRootCause(matrix.root_cause || issue.root_cause || '');
    setCountermeasure(matrix.countermeasure || issue.countermeasure || '');

    const s2_progress = matrix['2/4']?.progress || '';
    const s2_remark = matrix['2/4']?.remark || '';
    const s2_links = matrix['2/4']?.links || [];

    const s3_progress = matrix['3/4']?.progress || '';
    const s3_remark = matrix['3/4']?.remark || '';
    const s3_links = matrix['3/4']?.links || [];

    const s4_progress = matrix['4/4']?.progress || '';
    const s4_remark = matrix['4/4']?.remark || '';
    const s4_links = matrix['4/4']?.links || [];

    setStageDetails({
      '1/4': { progress: '', remark: '', links: [] },
      '2/4': { progress: s2_progress, remark: s2_remark, links: s2_links },
      '3/4': { progress: s3_progress, remark: s3_remark, links: s3_links },
      '4/4': { progress: s4_progress, remark: s4_remark, links: s4_links }
    });

    let activeStage = '2/4';
    if (cur.includes('3/4')) activeStage = '3/4';
    if (cur.includes('4/4')) activeStage = '4/4';
    setActiveStageTab(activeStage);
  };

  const handleStatusChange = (newStatus) => {
    setModalStatus(newStatus);

    let targetStage = '2/4';
    if (newStatus.includes('3/4')) targetStage = '3/4';
    else if (newStatus.includes('4/4')) targetStage = '4/4';

    setActiveStageTab(targetStage);

    setStageDetails((prev) => {
      if (newStatus === 'In Progress (1/4)') return prev;

      const currentTarget = prev[targetStage];
      const prevStageKey = targetStage === '4/4' ? '3/4' : '2/4';
      const sourceStage = prev[prevStageKey];

      if ((!currentTarget?.progress || currentTarget.progress.trim() === '') && sourceStage?.progress) {
        return {
          ...prev,
          [targetStage]: {
            progress: sourceStage.progress,
            remark: currentTarget?.remark || sourceStage.remark || '',
            links: (currentTarget?.links && currentTarget.links.length > 0) ? currentTarget.links : [...(sourceStage.links || [])]
          }
        };
      }
      return prev;
    });
  };

  const handleOpenUpdateModal = (issue) => {
    setSelectedIssue(issue);
    setTempLinkInput('');
    loadOriginalIssueData(issue);

    const savedDraftRaw = localStorage.getItem(`draft_update_${issue.id}`);
    if (savedDraftRaw) {
      try {
        const draft = JSON.parse(savedDraftRaw);
        if (draft.stageDetails) {
          setStageDetails(draft.stageDetails);
          setModalStatus(draft.modalStatus || issue.status || 'In Progress (1/4)');
          setRootCause(draft.rootCause ?? '');
          setCountermeasure(draft.countermeasure ?? '');
          setActiveStageTab(draft.activeStageTab || '2/4');
          setHasRestoredModalDraft(true);
        }
      } catch (err) {
        console.error('Failed to parse draft:', err);
      }
    }
  };

  const handleCloseModal = () => {
    setSelectedIssue(null);
    clearDeepLinkUrl();
  };

  const handleClearModalDraft = () => {
    if (!selectedIssue) return;
    const confirmClear = window.confirm('Discard local draft and reload saved data?');
    if (!confirmClear) return;

    localStorage.removeItem(`draft_update_${selectedIssue.id}`);
    setHasRestoredModalDraft(false);
    loadOriginalIssueData(selectedIssue);
  };

  // Deep Link Auto-Opener
  useEffect(() => {
    if (loading || !issues || issues.length === 0 || deepLinkProcessedRef.current) return;

    const searchParams = new URLSearchParams(window.location.search);
    const targetId = searchParams.get('issueId') || localStorage.getItem('open_issue_id');
    if (!targetId) return;

    const targetIssue = issues.find((item) => String(item.id) === String(targetId));
    if (targetIssue) {
      deepLinkProcessedRef.current = true;
      clearDeepLinkUrl();

      setSearchTerm('');
      setPeriodFilter('All');
      setStatusFilter('All');
      setClassificationFilter('All');
      setGroupFilter('All');
      setLocationFilter('All');
      setEngineVariantFilter('All');
      setNameFilter('All');

      handleOpenUpdateModal(targetIssue);
    }
  }, [issues, loading]);

  const maxUnlockedLevel = useMemo(() => {
    return STAGE_ORDER[modalStatus] || 1;
  }, [modalStatus]);

  const isStageUnlocked = (stageKey) => {
    const stageMap = { '2/4': 2, '3/4': 3, '4/4': 4 };
    return stageMap[stageKey] <= maxUnlockedLevel;
  };

  const handleStageFieldChange = (field, value) => {
    setStageDetails((prev) => ({
      ...prev,
      [activeStageTab]: {
        ...prev[activeStageTab],
        [field]: value
      }
    }));
  };

  const handleAddLink = () => {
    const trimmed = tempLinkInput.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch (_) {
      alert('Please enter a valid URL (e.g. https://...)');
      return;
    }

    const currentLinks = stageDetails[activeStageTab]?.links || [];
    setStageDetails((prev) => ({
      ...prev,
      [activeStageTab]: {
        ...prev[activeStageTab],
        links: [...currentLinks, trimmed]
      }
    }));
    setTempLinkInput('');
  };

  const handleRemoveLink = (idxToRemove) => {
    const currentLinks = stageDetails[activeStageTab]?.links || [];
    setStageDetails((prev) => ({
      ...prev,
      [activeStageTab]: {
        ...prev[activeStageTab],
        links: currentLinks.filter((_, idx) => idx !== idxToRemove)
      }
    }));
  };

  const handleCopyFromPrevious = () => {
    const prevStage = activeStageTab === '4/4' ? '3/4' : '2/4';
    const sourceData = stageDetails[prevStage];

    if (!sourceData || (!sourceData.progress && !sourceData.remark)) {
      alert(`No content available in ${prevStage} to forward.`);
      return;
    }

    setStageDetails((prev) => ({
      ...prev,
      [activeStageTab]: {
        progress: sourceData.progress || '',
        remark: sourceData.remark || '',
        links: [...(sourceData.links || [])]
      }
    }));
  };

  const handleSaveProgressMatrix = async (e) => {
    e.preventDefault();
    setUpdating(true);
    const now = new Date().toISOString();

    const structuredPayload = {
      root_cause: rootCause,
      countermeasure: countermeasure,
      '1/4': { progress: '', remark: '', links: [] },
      '2/4': stageDetails['2/4'],
      '3/4': stageDetails['3/4'],
      '4/4': stageDetails['4/4']
    };

    const latestNote = stageDetails[activeStageTab]?.progress || selectedIssue.progress_note || '';

    const { error } = await supabase
      .from('issues')
      .update({
        status: modalStatus,
        progress_note: latestNote,
        progress_matrix: structuredPayload,
        updated_at: now
      })
      .eq('id', selectedIssue.id);

    if (error) {
      alert('Failed to update progress: ' + error.message);
    } else {
      localStorage.removeItem(`draft_update_${selectedIssue.id}`);
      setHasRestoredModalDraft(false);
      clearDeepLinkUrl();

      alert('Progress updated successfully!');
      setSelectedIssue(null);
      fetchIssues();
    }
    setUpdating(false);
  };

  // Filter Logic
  const filteredIssues = issues
    .filter((issue) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        (issue.what_issue && issue.what_issue.toLowerCase().includes(searchLower)) ||
        (issue.description && issue.description.toLowerCase().includes(searchLower)) ||
        (issue.group_name && issue.group_name.toLowerCase().includes(searchLower)) ||
        (issue.classification && issue.classification.toLowerCase().includes(searchLower)) ||
        (issue.staff_name && issue.staff_name.toLowerCase().includes(searchLower)) ||
        (issue.staff_id && issue.staff_id.toLowerCase().includes(searchLower)) ||
        (issue.location && issue.location.toLowerCase().includes(searchLower)) ||
        (issue.engine_variant && issue.engine_variant.toLowerCase().includes(searchLower));

      const issueDateRaw = issue.date_time || issue.created_at;
      const estClosingRaw = issue.estimated_closing;
      const issueDateOnly = issueDateRaw ? issueDateRaw.split('T')[0].split(' ')[0] : '';
      const estDateOnly = estClosingRaw ? estClosingRaw.split('T')[0].split(' ')[0] : '';

      let matchesPeriod = true;
      if (periodFilter !== 'All') {
        if (periodFilter.includes('-W')) {
          const [targetMonth, targetWeek] = periodFilter.split('-W');
          const issueWeekNum = issueDateOnly.slice(0, 7) === targetMonth ? getWeekOfMonth(issueDateOnly) : null;
          const estWeekNum = estDateOnly.slice(0, 7) === targetMonth ? getWeekOfMonth(estDateOnly) : null;
          matchesPeriod = (issueWeekNum === targetWeek) || (estWeekNum === targetWeek);
        } else {
          matchesPeriod = issueDateOnly.slice(0, 7) === periodFilter || estDateOnly.slice(0, 7) === periodFilter;
        }
      }

      let matchesStatus = true;
      if (statusFilter !== 'All') {
        const rawStatus = (issue.status || '').toLowerCase().trim();
        const isClosed = rawStatus === 'closed' || rawStatus.includes('4/4') || rawStatus === 'completed' || rawStatus === 'complete';

        if (statusFilter === 'All In Progress') {
          matchesStatus = !isClosed;
        } else if (statusFilter === 'Closed (4/4)') {
          matchesStatus = isClosed;
        } else {
          matchesStatus = issue.status === statusFilter || (!issue.status && statusFilter === 'In Progress (1/4)');
        }
      }

      let matchesClassification = true;
      if (classificationFilter !== 'All') {
        matchesClassification = issue.classification === classificationFilter;
      }

      let matchesGroup = true;
      if (groupFilter !== 'All') {
        matchesGroup = issue.group_name === groupFilter;
      }

      let matchesLocation = true;
      if (locationFilter !== 'All') {
        matchesLocation = issue.location === locationFilter;
      }

      let matchesEngineVariant = true;
      if (engineVariantFilter !== 'All') {
        matchesEngineVariant = issue.engine_variant === engineVariantFilter;
      }

      let matchesName = true;
      if (nameFilter !== 'All') {
        const combinedName = issue.staff_name || issue.staff_id;
        matchesName = combinedName === nameFilter;
      }

      return (
        matchesSearch &&
        matchesPeriod &&
        matchesStatus &&
        matchesClassification &&
        matchesGroup &&
        matchesLocation &&
        matchesEngineVariant &&
        matchesName
      );
    })
    .sort((a, b) => {
      const dateA = new Date(a.date_time || a.created_at).getTime();
      const dateB = new Date(b.date_time || b.created_at).getTime();
      return dateB - dateA;
    });

  const currentPeriodLabel = useMemo(() => {
    if (periodFilter === 'All') return 'All_Period';
    for (const opt of periodOptions) {
      if (opt.key === periodFilter) return opt.label.replace(/\s+/g, '_');
      for (const w of opt.weeks) {
        if (w.value === periodFilter) return w.label.replace(/[^a-zA-Z0-9]/g, '_');
      }
    }
    return periodFilter.replace(/[^a-zA-Z0-9]/g, '_');
  }, [periodFilter, periodOptions]);

  // Export to Native Excel (.xlsx)
  const handleExportToExcel = () => {
    if (filteredIssues.length === 0) {
      alert('No issue data available to export with the current filters.');
      return;
    }

    const getHarveyBallStatus = (status) => {
      if (!status || status === 'Open' || status === 'In Progress (1/4)') {
        return '◔ In Progress (1/4)';
      }
      if (status.includes('2/4')) {
        return '◑ In Progress (2/4)';
      }
      if (status.includes('3/4')) {
        return '◕ In Progress (3/4)';
      }
      if (status.includes('4/4') || status === 'Closed' || status === 'Completed' || status === 'Complete') {
        return '⚫ Closed (4/4)';
      }
      return '◔ In Progress (1/4)';
    };

    const rowHeights = [{ hpt: 28 }];

    const formattedData = filteredIssues.map((i, index) => {
      const rawDate = i.date_time || i.created_at;
      const pMatrix = i.progress_matrix || {};

      const progressList = ['2/4', '3/4', '4/4']
        .filter((stg) => pMatrix[stg]?.progress)
        .map((stg) => `${stg === '4/4' ? 'Closed 4/4' : `In Progress ${stg}`}: ${pMatrix[stg].progress}`);
      const formattedProgress = progressList.length > 0 ? progressList.join('\r\n') : '-';

      const remarkList = ['2/4', '3/4', '4/4']
        .filter((stg) => pMatrix[stg]?.remark)
        .map((stg) => `${stg === '4/4' ? 'Closed 4/4' : `In Progress ${stg}`}: ${pMatrix[stg].remark}`);
      const formattedRemarks = remarkList.length > 0 ? remarkList.join('\r\n') : '-';

      const maxLines = Math.max(progressList.length, remarkList.length, 1);
      rowHeights.push({ hpt: Math.max(22, maxLines * 18) });

      return {
        'No.': index + 1,
        'Reported by': i.staff_name || i.staff_id || '-',
        'Date & Time': rawDate ? formatDateTime(rawDate) : '-',
        'Issue Classification': i.classification || '-',
        'Status': getHarveyBallStatus(i.status),
        'Issue': i.what_issue || '-',
        'Issue Description': i.description || '-',
        'Group': i.group_name || '-',
        'Location / Station': i.location || '-',
        'Variant': i.engine_variant || '-',
        'Person in Charge': i.pic_name || i.pic || '-',
        'Root Cause': pMatrix.root_cause || '-',
        'Countermeasure': pMatrix.countermeasure || '-',
        'Progress': formattedProgress,
        'Remarks': formattedRemarks,
        'Estimate Closing Date': i.estimated_closing ? formatDateOnly(i.estimated_closing) : '-',
        'File Attachment URL': i.file_url || '-',
        'External Link': i.onedrive_link || '-'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    worksheet['!rows'] = rowHeights;

    Object.keys(worksheet).forEach((cell) => {
      if (cell.startsWith('!')) return;

      const isHeaderRow = /^[A-Z]+1$/.test(cell);

      if (isHeaderRow) {
        worksheet[cell].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "0D3B66" } },
          alignment: { vertical: "center", horizontal: "center", wrapText: true }
        };
      } else {
        worksheet[cell].s = {
          alignment: { vertical: "top", wrapText: true }
        };
      }
    });

    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 22 },
      { wch: 18 },
      { wch: 20 },
      { wch: 28 },
      { wch: 38 },
      { wch: 20 },
      { wch: 20 },
      { wch: 18 },
      { wch: 22 },
      { wch: 30 },
      { wch: 30 },
      { wch: 45 },
      { wch: 45 },
      { wch: 20 },
      { wch: 40 },
      { wch: 40 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Issues Report');

    const today = new Date().toISOString().slice(0, 10);
    const groupLabel = groupFilter === 'All' ? 'All_Groups' : groupFilter.replace(/\s+/g, '_');
    XLSX.writeFile(workbook, `Issues_Report_${groupLabel}_${currentPeriodLabel}_${today}.xlsx`);
  };

  return (
    <div style={{ padding: '10px 20px', maxWidth: '1280px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: '#0d3b66', padding: '15px 20px', borderRadius: '8px', color: '#fff', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '22px' }}>Issue List</h2>

        <button
          onClick={handleExportToExcel}
          style={{
            backgroundColor: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
          }}
        >
          📥 Export to Excel 
          {(groupFilter !== 'All' || periodFilter !== 'All') && (
            <span style={{ fontSize: '11px', opacity: 0.9 }}>
              ({groupFilter !== 'All' ? groupFilter : 'All Groups'} | {periodFilter !== 'All' ? currentPeriodLabel.replace(/_/g, ' ') : 'All Time'})
            </span>
          )}
        </button>
      </div>

      {/* Search & Filter Section */}
      <div style={{ backgroundColor: '#fff', padding: '16px 18px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', marginBottom: '25px' }}>
        
        {/* Row 1: Search */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#333', display: 'block', marginBottom: '6px' }}>
            🔍 Search
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 35px 9px 12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                fontSize: '13px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#888',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Strict Order */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
            gap: '8px',
            alignItems: 'end'
          }}
        >
          {/* 1. Date */}
          <div style={{ minWidth: '0' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#444', display: 'block', marginBottom: '4px', whiteSpace: 'nowrap' }}>
              🗓️ Period:
            </label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 4px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px', backgroundColor: '#fff', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              <option value="All">All Time</option>
              {periodOptions.map((opt) => (
                <optgroup key={opt.key} label={`── ${opt.label} ──`}>
                  <option value={opt.key}>📅 All of {opt.label}</option>
                  {opt.weeks.map((w) => (
                    <option key={w.value} value={w.value}>
                      &nbsp;&nbsp;&nbsp;{w.label.replace(`${opt.label} - `, '')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* 2. Status */}
          <div style={{ minWidth: '0' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#444', display: 'block', marginBottom: '4px', whiteSpace: 'nowrap' }}>
              📌 Status:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 4px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px', backgroundColor: '#fff', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              <option value="All">All Statuses</option>
              <option value="All In Progress">⏳ All In Progress (1/4 - 3/4)</option>
              <option value="In Progress (1/4)">◔ In Progress (1/4)</option>
              <option value="In Progress (2/4)">◑ In Progress (2/4)</option>
              <option value="In Progress (3/4)">◕ In Progress (3/4)</option>
              <option value="Closed (4/4)">⚫ Closed (4/4)</option>
            </select>
          </div>

          {/* 3. Class */}
          <div style={{ minWidth: '0' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#444', display: 'block', marginBottom: '4px', whiteSpace: 'nowrap' }}>
              🏷️ Class:
            </label>
            <select
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 4px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px', backgroundColor: '#fff', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              <option value="All">All Classes</option>
              <option value="A">Class A</option>
              <option value="B">Class B</option>
              <option value="C">Class C</option>
            </select>
          </div>

          {/* 4. Group */}
          <div style={{ minWidth: '0' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#444', display: 'block', marginBottom: '4px', whiteSpace: 'nowrap' }}>
              👥 Group:
            </label>
            <select
              value={groupFilter}
              onChange={handleGroupFilterChange}
              style={{ width: '100%', padding: '6px 4px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px', backgroundColor: '#fff', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              <option value="All">All Groups</option>
              <option value="Assembly Line">Assembly Line</option>
              <option value="Test Line">Test Line</option>
              <option value="7DCT">7DCT</option>
              <option value="EDU & DHT">EDU & DHT</option>
              <option value="IT">IT (All Stations)</option>
            </select>
          </div>

          {/* 5. Location */}
          <div style={{ minWidth: '0' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#444', display: 'block', marginBottom: '4px', whiteSpace: 'nowrap' }}>
              📍 Location:
            </label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 4px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px', backgroundColor: '#fff', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              <option value="All">All Locations ({filteredLocationOptions.length})</option>
              {filteredLocationOptions.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* 6. Variant */}
          <div style={{ minWidth: '0' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#444', display: 'block', marginBottom: '4px', whiteSpace: 'nowrap' }}>
              ⚙️ Variant:
            </label>
            <select
              value={engineVariantFilter}
              onChange={(e) => setEngineVariantFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 4px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px', backgroundColor: '#fff', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              <option value="All">All Variants ({uniqueEngineVariants.length})</option>
              {uniqueEngineVariants.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* 7. Name */}
          <div style={{ minWidth: '0' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#444', display: 'block', marginBottom: '4px', whiteSpace: 'nowrap' }}>
              👤 Name:
            </label>
            <select
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 4px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '11px', backgroundColor: '#fff', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              <option value="All">All Names</option>
              {uniqueNames.map((nm) => (
                <option key={nm} value={nm}>{nm}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* Issues Cards */}
      {loading ? (
        <p style={{ textAlign: 'center', padding: '40px' }}>Loading issues...</p>
      ) : filteredIssues.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '40px' }}>No issues found matching your filter criteria.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '15px' }}>
          {filteredIssues.map((issue) => {
            const statusInfo = getStatusDetails(issue.status);
            const manualDate = issue.date_time || issue.created_at;
            const matrix = issue.progress_matrix || {};

            const curStatus = issue.status || 'In Progress (1/4)';
            const maxStageLevel = STAGE_ORDER[curStatus] || 1;

            const stagesToDisplay = [
              { key: '2/4', level: 2, data: matrix['2/4'], label: 'In Progress 2/4:' },
              { key: '3/4', level: 3, data: matrix['3/4'], label: 'In Progress 3/4:' },
              { key: '4/4', level: 4, data: matrix['4/4'], label: 'Closed (4/4):' },
            ];

            return (
              <div
                key={issue.id}
                id={`issue-card-${issue.id}`}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  padding: '14px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>
                      📅 Date: {formatDateTime(manualDate)}
                    </span>

                    {issue.classification && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 'bold',
                          color: '#0d3b66',
                          backgroundColor: '#e2e8f0',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        🏷️ Class: {issue.classification}
                      </span>
                    )}
                  </div>

                  <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#0d3b66', marginBottom: '6px', textTransform: 'capitalize' }}>
                    {issue.what_issue || 'Untitled Issue'}
                  </div>

                  {issue.description && (
                    <div style={{ fontSize: '12px', color: '#555', backgroundColor: '#f1f5f9', padding: '6px 8px', borderRadius: '4px', marginBottom: '10px' }}>
                      📝 <b>Desc:</b> {issue.description}
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: '#444', display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                    <div>👥 <b>Group:</b> {issue.group_name || '-'}</div>
                    <div>👤 <b>Name:</b> {issue.staff_name || issue.staff_id || '-'}</div>
                    <div>📍 <b>Location:</b> {issue.location || '-'}</div>
                    <div>⚙️ <b>Variant:</b> {issue.engine_variant || '-'}</div>
                    <div>👤 <b>PIC:</b> {issue.pic_name || issue.pic || '-'}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>🎯 <b>Est. Closing:</b></span>
                      {editingEstClosingId === issue.id ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="date"
                            value={newEstClosingDate}
                            onChange={(e) => setNewEstClosingDate(e.target.value)}
                            style={{ padding: '2px 5px', fontSize: '11px', borderRadius: '4px', border: '1px solid #0d3b66' }}
                          />
                          <button
                            onClick={() => handleSaveEstClosing(issue.id)}
                            disabled={savingEstDate}
                            style={{ backgroundColor: '#0d3b66', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {savingEstDate ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingEstClosingId(null)}
                            style={{ backgroundColor: '#e2e8f0', color: '#333', border: 'none', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 'bold', color: '#0d3b66' }}>
                            {formatDateOnly(issue.estimated_closing)}
                          </span>
                          <button
                            onClick={() => {
                              setEditingEstClosingId(issue.id);
                              setNewEstClosingDate(issue.estimated_closing ? issue.estimated_closing.split('T')[0].split(' ')[0] : '');
                            }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}
                            title="Edit Est. Closing Date"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Overall Root Cause & Countermeasure */}
                    {(matrix.root_cause || matrix.countermeasure) && (
                      <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '6px 8px', marginTop: '6px', fontSize: '11px' }}>
                        {matrix.root_cause && <div>🔍 <b>Root Cause:</b> {matrix.root_cause}</div>}
                        {matrix.countermeasure && <div style={{ marginTop: '3px' }}>🛠️ <b>Countermeasure:</b> {matrix.countermeasure}</div>}
                      </div>
                    )}

                    {/* Stage Progress Details */}
                    {stagesToDisplay.map(({ key, level, data, label }) => {
                      if (level > maxStageLevel) return null;
                      if (!data || (!data.progress && !data.remark && (!data.links || data.links.length === 0))) return null;

                      return (
                        <div key={key} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: '4px', marginTop: '4px', fontSize: '11px' }}>
                          <span style={{ fontWeight: 'bold', color: key === '4/4' ? '#16a34a' : '#0369a1' }}>
                            {label}
                          </span>
                          {data.progress && <div>• <b>Action:</b> {data.progress}</div>}
                          {data.remark && <div>• <b>Remark:</b> {data.remark}</div>}
                          {data.links && data.links.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                              {data.links.map((lnk, lIdx) => (
                                <a
                                  key={lIdx}
                                  href={lnk}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#2563eb', textDecoration: 'underline', fontSize: '10px' }}
                                >
                                  🔗 Link {lIdx + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Action Section */}
                <div style={{ borderTop: '1px solid #eee', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span
                    style={{
                      backgroundColor: statusInfo.bg,
                      color: statusInfo.color,
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>{statusInfo.icon}</span>
                    <span>{statusInfo.text}</span>
                  </span>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {issue.file_url && (
                      <a
                        href={issue.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '11px', color: '#0d3b66', fontWeight: 'bold', textDecoration: 'none', padding: '4px 8px', border: '1px solid #0d3b66', borderRadius: '4px', backgroundColor: '#fff' }}
                      >
                        👁️ File
                      </a>
                    )}

                    <button
                      onClick={() => handleOpenUpdateModal(issue)}
                      style={{ border: 'none', backgroundColor: '#e9ecef', cursor: 'pointer', padding: '5px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', color: '#333' }}
                    >
                      ✏️ Update
                    </button>

                    <button
                      onClick={() => handleDeleteIssue(issue)}
                      style={{ border: 'none', backgroundColor: '#dc3545', color: '#fff', cursor: 'pointer', padding: '5px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Update Progress Modal (Stages 2/4, 3/4 & 4/4) */}
      {selectedIssue && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '15px' }}>
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', width: '100%', maxWidth: '750px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#0d3b66', fontSize: '18px' }}>Update Progress & Action Details</h3>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '8px' }}>
              <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>
                <b>Issue:</b> {selectedIssue.what_issue}
              </p>
              {hasRestoredModalDraft && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#0284c7', backgroundColor: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                    📝 Draft Loaded
                  </span>
                  <button
                    type="button"
                    onClick={handleClearModalDraft}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      fontSize: '11px',
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

            <form onSubmit={handleSaveProgressMatrix}>
              
              {/* Status Selector */}
              <div style={{ marginBottom: '15px', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '12px', marginBottom: '5px', color: '#0f172a' }}>
                  Current Closing Status:
                </label>
                <select
                  value={modalStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '5px', border: '1px solid #0d3b66', fontSize: '13px', backgroundColor: '#fff', fontWeight: 'bold' }}
                >
                  <option value="In Progress (1/4)">◔ In Progress (1/4)</option>
                  <option value="In Progress (2/4)">◑ In Progress (2/4)</option>
                  <option value="In Progress (3/4)">◕ In Progress (3/4)</option>
                  <option value="Closed (4/4)">⚫ Closed (4/4)</option>
                </select>
              </div>

              {/* 1. Root Cause & Countermeasure */}
              <div style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#1e3a8a', display: 'block', marginBottom: '8px' }}>
                  📋 Overall Root Cause & Countermeasure:
                </span>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e3a8a', display: 'block', marginBottom: '3px' }}>
                      Root Cause:
                    </label>
                    <textarea
                      rows="2"
                      placeholder="Enter underlying root cause..."
                      value={rootCause}
                      onChange={(e) => setRootCause(e.target.value)}
                      style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #93c5fd', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e3a8a', display: 'block', marginBottom: '3px' }}>
                      Countermeasure:
                    </label>
                    <textarea
                      rows="2"
                      placeholder="Enter countermeasure / action plan..."
                      value={countermeasure}
                      onChange={(e) => setCountermeasure(e.target.value)}
                      style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #93c5fd', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* 2. In Progress Tabs (2/4, 3/4 & 4/4) */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px', flexWrap: 'wrap' }}>
                {['2/4', '3/4', '4/4'].map((stage) => {
                  const unlocked = isStageUnlocked(stage);
                  const isSelected = activeStageTab === stage;
                  const labelTitle = stage === '4/4' ? 'Closed (4/4)' : `In Progress ${stage}`;
                  return (
                    <button
                      key={stage}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => setActiveStageTab(stage)}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: unlocked ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        backgroundColor: isSelected ? '#0d3b66' : unlocked ? '#e2e8f0' : '#f1f5f9',
                        color: isSelected ? '#fff' : unlocked ? '#1e293b' : '#94a3b8',
                        opacity: unlocked ? 1 : 0.6
                      }}
                      title={!unlocked ? `Update status to at least ${stage} to unlock this tab.` : ''}
                    >
                      {!unlocked ? '🔒 ' : '✓ '} {labelTitle}
                    </button>
                  );
                })}
              </div>

              {/* 3. Progress & Remark Inputs (2/4, 3/4, 4/4) */}
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px', marginBottom: '15px', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#0d3b66' }}>
                    {activeStageTab === '4/4' ? 'Action & Verification for Closed (4/4):' : `Progress & Remark for In Progress ${activeStageTab}:`}
                  </span>

                  {activeStageTab !== '2/4' && (
                    <button
                      type="button"
                      onClick={handleCopyFromPrevious}
                      style={{
                        backgroundColor: '#e0f2fe',
                        color: '#0369a1',
                        border: '1px solid #bae6fd',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                      title="Copy details from previous stage to edit"
                    >
                      ⏩ Forward from {activeStageTab === '4/4' ? '3/4' : '2/4'}
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '3px' }}>
                      {activeStageTab === '4/4' ? 'Final Action / Verification (4/4):' : `Progress / Action Taken (${activeStageTab}):`}
                    </label>
                    <textarea
                      rows="3"
                      placeholder={`Enter notes for stage ${activeStageTab}...`}
                      value={stageDetails[activeStageTab]?.progress || ''}
                      onChange={(e) => handleStageFieldChange('progress', e.target.value)}
                      style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '3px' }}>
                      Remark ({activeStageTab}):
                    </label>
                    <textarea
                      rows="3"
                      placeholder={`Enter remarks / blockers for stage ${activeStageTab}...`}
                      value={stageDetails[activeStageTab]?.remark || ''}
                      onChange={(e) => handleStageFieldChange('remark', e.target.value)}
                      style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Multiple Attachment Links */}
                <div style={{ marginTop: '12px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    🔗 Attachment Links for Stage {activeStageTab}:
                  </label>

                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <input
                      type="url"
                      placeholder="Paste Link"
                      value={tempLinkInput}
                      onChange={(e) => setTempLinkInput(e.target.value)}
                      style={{ flex: 1, padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddLink}
                      style={{ padding: '6px 12px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      + Add Link
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {(stageDetails[activeStageTab]?.links || []).map((lnk, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        <a href={lnk} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>
                          {lnk}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveLink(idx)}
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                          title="Remove this link"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{ padding: '8px 16px', border: 'none', backgroundColor: '#e2e8f0', color: '#333', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  style={{ padding: '8px 16px', border: 'none', backgroundColor: '#0d3b66', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  {updating ? 'Saving...' : 'Save All Updates'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}