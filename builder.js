import fs from 'fs';
import path from 'path';
import { checklistPart1 } from './data_part1.js';
import { checklistPart2 } from './data_part2.js';
import { legalChanges, complianceCalendar } from './data_extras.js';

const allChecklistItems = [...checklistPart1, ...checklistPart2];

console.log(`Loaded ${allChecklistItems.length} checklist items.`);
console.log(`Loaded ${legalChanges.length} legal changes.`);
console.log(`Loaded ${complianceCalendar.length} compliance calendar periods.`);

const template = fs.readFileSync(path.resolve('./template.html'), 'utf-8');

const scriptContent = `
<script>
  const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

  const rawChecklist = ${JSON.stringify(allChecklistItems, null, 2)};
  const rawLegalChanges = ${JSON.stringify(legalChanges, null, 2)};
  const rawComplianceCalendar = ${JSON.stringify(complianceCalendar, null, 2)};

  const STORAGE_KEY = 'compliance_checklist_state_v1';

  createApp({
    setup() {
      // Navigation
      const activeTab = ref('checklist'); // 'checklist' | 'legalUpdates' | 'calendar'
      const toastMessage = ref('');
      const savedItemNotification = ref(null);

      // Data states
      const items = ref(rawChecklist);
      const legalChanges = ref(rawLegalChanges);
      const complianceCalendar = ref(rawComplianceCalendar);

      // Accordion expanded state
      const expandedMap = reactive({});
      // Expand first 2 items by default for nice presentation
      expandedMap[1] = true;
      expandedMap[2] = true;

      // Filters
      const searchQuery = ref('');
      const filterGroup = ref('');
      const filterRisk = ref('');
      const filterAssignee = ref('');
      const filterStatus = ref('');
      const calendarFilter = ref('');

      // Show toast helper
      const showToast = (msg, duration = 2500) => {
        toastMessage.value = msg;
        setTimeout(() => {
          if (toastMessage.value === msg) {
            toastMessage.value = '';
          }
        }, duration);
      };

      // Load saved state from LocalStorage
      const loadSavedState = () => {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              const savedMap = new Map(parsed.map(x => [x.id, x]));
              items.value.forEach(item => {
                const s = savedMap.get(item.id);
                if (s) {
                  if (s.status) item.status = s.status;
                  if (s.note !== undefined) item.note = s.note;
                }
              });
            }
          }
        } catch (e) {
          console.warn('Could not load stored compliance data:', e);
        }
      };

      // Save state to LocalStorage
      const saveState = () => {
        try {
          const payload = items.value.map(i => ({
            id: i.id,
            status: i.status,
            note: i.note || ''
          }));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
          console.warn('Could not save compliance data:', e);
        }
      };

      onMounted(() => {
        loadSavedState();
      });

      // Distinct lists for dropdowns
      const groupList = computed(() => {
        return Array.from(new Set(items.value.map(i => i.group)));
      });

      const assigneeList = computed(() => {
        const set = new Set();
        items.value.forEach(i => {
          i.assignee.split(',').forEach(a => set.add(a.trim()));
        });
        return Array.from(set).sort();
      });

      // Filtered items
      const filteredItems = computed(() => {
        const q = searchQuery.value.trim().toLowerCase();
        const grp = filterGroup.value;
        const rsk = filterRisk.value;
        const asn = filterAssignee.value.toLowerCase();
        const stt = filterStatus.value;

        return items.value.filter(item => {
          if (grp && item.group !== grp) return false;
          if (rsk && item.risk !== rsk) return false;
          if (stt && item.status !== stt) return false;
          if (asn && !item.assignee.toLowerCase().includes(asn)) return false;

          if (q) {
            const inTitle = item.title.toLowerCase().includes(q);
            const inConseq = item.consequences.toLowerCase().includes(q);
            const inRef = item.reference.toLowerCase().includes(q);
            const inWhy = item.whyCare.toLowerCase().includes(q);
            const inQuest = item.questions.toLowerCase().includes(q);
            const inGroup = item.group.toLowerCase().includes(q);
            const inNote = (item.note || '').toLowerCase().includes(q);
            const inId = String(item.id) === q || ('#' + item.id) === q;

            if (!inTitle && !inConseq && !inRef && !inWhy && !inQuest && !inGroup && !inNote && !inId) {
              return false;
            }
          }
          return true;
        });
      });

      const hasActiveFilter = computed(() => {
        return !!(searchQuery.value || filterGroup.value || filterRisk.value || filterAssignee.value || filterStatus.value);
      });

      const resetFilters = () => {
        searchQuery.value = '';
        filterGroup.value = '';
        filterRisk.value = '';
        filterAssignee.value = '';
        filterStatus.value = '';
      };

      const setRiskFilter = (riskVal) => {
        if (filterRisk.value === riskVal) {
          filterRisk.value = '';
        } else {
          filterRisk.value = riskVal;
        }
      };

      // Statistics calculations
      const stats = computed(() => {
        const total = items.value.length || 1;
        let completed = 0;
        let inProgress = 0;
        let pending = 0;

        let highTotal = 0;
        let highCompleted = 0;

        let medTotal = 0;
        let medCompleted = 0;

        let lowTotal = 0;
        let lowCompleted = 0;

        items.value.forEach(i => {
          if (i.status === 'Đạt') completed++;
          else if (i.status === 'Đang làm') inProgress++;
          else pending++;

          if (i.risk === 'Cao') {
            highTotal++;
            if (i.status === 'Đạt') highCompleted++;
          } else if (i.risk === 'Trung bình') {
            medTotal++;
            if (i.status === 'Đạt') medCompleted++;
          } else if (i.risk === 'Thấp') {
            lowTotal++;
            if (i.status === 'Đạt') lowCompleted++;
          }
        });

        return {
          completedCount: completed,
          inProgressCount: inProgress,
          pendingCount: pending,
          percentage: Math.round((completed / total) * 100),
          highRiskTotal: highTotal,
          highRiskCompleted: highCompleted,
          highRiskIncomplete: highTotal - highCompleted,
          medRiskTotal: medTotal,
          medRiskCompleted: medCompleted,
          lowRiskTotal: lowTotal,
          lowRiskCompleted: lowCompleted
        };
      });

      // Actions on items
      const toggleExpand = (id) => {
        expandedMap[id] = !expandedMap[id];
      };

      const expandAll = () => {
        items.value.forEach(i => {
          expandedMap[i.id] = true;
        });
      };

      const collapseAll = () => {
        items.value.forEach(i => {
          expandedMap[i.id] = false;
        });
      };

      const cycleStatus = (item) => {
        if (item.status === 'Chưa làm') {
          item.status = 'Đang làm';
        } else if (item.status === 'Đang làm') {
          item.status = 'Đạt';
        } else {
          item.status = 'Chưa làm';
        }
        saveState();
        showToast(\`Đã cập nhật mục #\${item.id} -> \${item.status}\`);
      };

      const setStatus = (item, newStatus) => {
        item.status = newStatus;
        saveState();
        showToast(\`Mục #\${item.id}: \${newStatus}\`);
      };

      let noteTimeout = null;
      const onNoteChange = (item) => {
        clearTimeout(noteTimeout);
        savedItemNotification.value = item.id;
        noteTimeout = setTimeout(() => {
          saveState();
          setTimeout(() => {
            if (savedItemNotification.value === item.id) {
              savedItemNotification.value = null;
            }
          }, 1500);
        }, 350);
      };

      // Navigate to a specific item from Legal Updates tab
      const navigateToItem = (itemId) => {
        activeTab.value = 'checklist';
        resetFilters();
        expandedMap[itemId] = true;
        setTimeout(() => {
          const el = document.getElementById('item-' + itemId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-4', 'ring-brand-500');
            setTimeout(() => {
              el.classList.remove('ring-4', 'ring-brand-500');
            }, 2500);
          }
        }, 150);
      };

      // Calendar filtered view
      const filteredCalendar = computed(() => {
        if (!calendarFilter.value) return complianceCalendar.value;
        return complianceCalendar.value.filter(c => c.period === calendarFilter.value);
      });

      // Export & Print
      const printReport = () => {
        // Expand all so all details are visible in print
        expandAll();
        setTimeout(() => {
          window.print();
        }, 200);
      };

      const exportJson = () => {
        const payload = {
          exportDate: new Date().toISOString(),
          appName: 'Corporate Compliance Checklist',
          stats: stats.value,
          data: items.value.map(i => ({
            id: i.id,
            title: i.title,
            group: i.group,
            risk: i.risk,
            assignee: i.assignee,
            status: i.status,
            note: i.note || ''
          }))
        };
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', \`compliance-progress-\${new Date().toISOString().slice(0, 10)}.json\`);
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Đã xuất file JSON tiến độ thành công!');
      };

      const importJson = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsed = JSON.parse(e.target.result);
            const list = parsed.data || (Array.isArray(parsed) ? parsed : null);
            if (!list) {
              alert('File JSON không đúng định dạng chuẩn.');
              return;
            }
            const map = new Map(list.map(x => [x.id, x]));
            items.value.forEach(item => {
              const matched = map.get(item.id);
              if (matched) {
                if (matched.status) item.status = matched.status;
                if (matched.note !== undefined) item.note = matched.note;
              }
            });
            saveState();
            showToast('Đã khôi phục dữ liệu tiến độ từ JSON thành công!');
          } catch (err) {
            alert('Lỗi khi đọc file JSON: ' + err.message);
          }
        };
        reader.readAsText(file);
        // reset input
        event.target.value = '';
      };

      const confirmReset = () => {
        if (confirm('Bạn có chắc chắn muốn đặt lại tất cả trạng thái checklist và ghi chú về ban đầu?')) {
          localStorage.removeItem(STORAGE_KEY);
          items.value.forEach(item => {
            item.status = 'Chưa làm';
            item.note = '';
          });
          // keep example note on item 1
          items.value[0].note = 'Ví dụ cách ghi: Thiếu chứng từ góp vốn đợt 2. Kế toán bổ sung trước 30/9.';
          saveState();
          showToast('Đã đặt lại dữ liệu về mặc định ban đầu!');
        }
      };

      const currentDateFormatted = computed(() => {
        return new Date().toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      });

      return {
        activeTab,
        toastMessage,
        savedItemNotification,
        items,
        legalChanges,
        complianceCalendar,
        expandedMap,
        searchQuery,
        filterGroup,
        filterRisk,
        filterAssignee,
        filterStatus,
        calendarFilter,
        groupList,
        assigneeList,
        filteredItems,
        hasActiveFilter,
        resetFilters,
        setRiskFilter,
        stats,
        toggleExpand,
        expandAll,
        collapseAll,
        cycleStatus,
        setStatus,
        onNoteChange,
        navigateToItem,
        filteredCalendar,
        printReport,
        exportJson,
        importJson,
        confirmReset,
        currentDateFormatted
      };
    }
  }).mount('#app');
</script>
`;

const finalHtml = template.replace('<!-- INJECTED_DATA_AND_APP_LOGIC -->', scriptContent);
fs.writeFileSync(path.resolve('./index.html'), finalHtml, 'utf-8');
console.log('Successfully generated standalone /index.html');
