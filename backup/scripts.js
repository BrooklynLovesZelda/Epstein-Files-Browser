// Dynamic asset browser with chunked list loading and previews.

const PREVIEW_CHAR_LIMIT = 8000;
const PREVIEW_LINE_LIMIT = 120;
const CHUNK_SIZE = 500;
const MAP_BATCH = 800;
const TABLE_ROW_LIMIT = 20;
const TABLE_COL_LIMIT = 10;

const datasetPackage = {
  title: "Full Asset Drop",
  size: "13.7 GB",
  url: "assets/DataSets.7z" // points to bundled archive
};

const refs = {
  refresh: document.getElementById("refreshButton"),
  fileList: document.getElementById("fileList"),
  fileSearch: document.getElementById("fileSearch"),
  fileCount: document.getElementById("fileCount"),
  paneTitle: document.getElementById("paneTitle"),
  viewer: document.getElementById("viewer"),
  showAllToggle: document.getElementById("showAllToggle"),
  datasetTitle: document.getElementById("datasetTitle"),
  datasetSize: document.getElementById("datasetSize"),
  downloadButtons: [document.getElementById("downloadAll"), document.getElementById("ctaDownload"), document.getElementById("ctaFooter")],
  progress: document.getElementById("downloadProgress")
};

refs.datasetTitle.textContent = datasetPackage.title;
refs.datasetSize.textContent = datasetPackage.size;

const state = {
  mapped: [],
  filteredAll: [],
  filtered: [],
  selected: null,
  showAll: false,
  limited: true
};

const normalizePath = (p) => p.replace(/\\\\/g, "/").replace(/\\/g, "/");
const formatSize = (bytes) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, exp)).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
};

const detectType = (path) => {
  const ext = path.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["mp4", "avi", "mov", "webm"].includes(ext)) return "video";
  if (["m4a", "mp3", "wav"].includes(ext)) return "audio";
  if (["csv", "tsv"].includes(ext)) return "table";
  if (["txt", "log"].includes(ext)) return "text";
  if (["xls", "xlsx"].includes(ext)) return "spreadsheet";
  if (["dat", "opt"].includes(ext)) return "data";
  return "file";
};

const simulateDownload = () => {
  let progress = 0;
  refs.progress.style.width = "0%";
  const timer = setInterval(() => {
    progress += Math.random() * 20;
    if (progress >= 100) {
      progress = 100;
      clearInterval(timer);
      if (datasetPackage.url && datasetPackage.url !== "#") {
        window.open(datasetPackage.url, "_blank");
      } else {
        alert("Set datasetPackage.url to enable downloads.");
      }
    }
    refs.progress.style.width = `${progress}%`;
  }, 220);
};

refs.downloadButtons.forEach((btn) => btn?.addEventListener("click", simulateDownload));

const loadManifest = async () => {
  refs.fileCount.textContent = "Loading...";
  try {
    const data =
      (typeof window.__ASSET_MANIFEST__ !== "undefined" && window.__ASSET_MANIFEST__) ||
      (await (await fetch("assets-manifest.json")).json());
    mapManifestInBatches(data);
  } catch (err) {
    refs.fileCount.textContent = "Failed to load manifest";
    console.error(err);
  }
};

const mapManifestInBatches = (data) => {
  state.mapped = [];
  let idx = 0;
  const step = () => {
    const end = Math.min(idx + MAP_BATCH, data.length);
    for (let i = idx; i < end; i++) {
      const path = normalizePath(data[i].path);
      state.mapped.push({
        id: i,
        path,
        name: path.split("/").pop(),
        size: data[i].size,
        sizeLabel: formatSize(data[i].size),
        type: detectType(path)
      });
    }
    idx = end;
    refs.fileCount.textContent = `Loading ${idx}/${data.length}`;
    if (idx < data.length) {
      setTimeout(step, 0);
    } else {
      applyFilter();
    }
  };
  step();
};

const renderList = () => {
  refs.fileList.innerHTML = "";
  if (!state.filtered.length) {
    refs.fileList.innerHTML = `<div class="file-row"><span>No files match your search.</span></div>`;
    return;
  }
  state.filtered.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-row";
    if (state.selected && state.selected.id === file.id) row.classList.add("active");
    row.innerHTML = `
      <div><strong>${file.name}</strong></div>
      <div class="meta">${file.path}</div>
      <div class="meta">${file.sizeLabel}</div>
    `;
    row.onclick = () => {
      state.selected = file;
      renderList();
      previewFile(file);
    };
    refs.fileList.appendChild(row);
  });
  refs.fileCount.textContent = `${state.filtered.length}/${state.filteredAll.length || state.filtered.length} loaded`;
};

const applyFilter = () => {
  const query = refs.fileSearch.value.toLowerCase().trim();
  state.filteredAll = state.mapped.filter((file) => file.name.toLowerCase().includes(query) || file.path.toLowerCase().includes(query));
  const limit = Math.min(CHUNK_SIZE, state.filteredAll.length);
  state.filtered = state.filteredAll.slice(0, limit);
  state.limited = state.filteredAll.length > limit;
  renderList();
};

const renderViewerHeader = (file) => {
  const header = document.createElement("div");
  header.innerHTML = `
    <p class="eyebrow">${file.type}</p>
    <h4>${file.name}</h4>
    <p class="meta">${file.path} • ${file.sizeLabel}</p>
    <div class="view-toggles">
      <button class="ghost" id="openFile">Open in new tab</button>
      <button class="primary" id="downloadFile">Download</button>
    </div>
  `;
  header.querySelector("#openFile").onclick = () => window.open(file.path, "_blank");
  header.querySelector("#downloadFile").onclick = () => window.open(file.path, "_blank");
  return header;
};

const previewFile = async (file) => {
  refs.viewer.innerHTML = "";
  refs.paneTitle.textContent = file.name;
  const header = renderViewerHeader(file);
  refs.viewer.appendChild(header);

  let content;
  try {
    if (file.type === "pdf") {
      content = document.createElement("iframe");
      content.src = file.path;
      content.title = file.name;
    } else if (file.type === "video") {
      content = document.createElement("video");
      content.controls = true;
      content.src = file.path;
    } else if (file.type === "audio") {
      content = document.createElement("audio");
      content.controls = true;
      content.src = file.path;
    } else if (file.type === "table") {
      const text = await fetchText(file.path, state.showAll);
      content = renderTablePreview(text.body, file.path.endsWith(".tsv") ? "\t" : ",", state.showAll);
    } else if (file.type === "text" || file.type === "data") {
      const text = await fetchText(file.path, state.showAll);
      content = document.createElement("pre");
      content.textContent = text.body;
      content.className = "meta";
      if (text.truncated && !state.showAll) {
        const note = document.createElement("p");
        note.className = "note";
        note.textContent = "Preview truncated for performance. Toggle 'Show full previews' to load everything.";
        refs.viewer.appendChild(note);
      }
    } else if (file.type === "spreadsheet") {
      content = document.createElement("div");
      content.innerHTML = `<p class="meta">Spreadsheet preview not supported here. Use download/open to view.</p>`;
    } else {
      content = document.createElement("div");
      content.innerHTML = `<p class="meta">Preview not available. Use download/open to inspect.</p>`;
    }
  } catch (err) {
    content = document.createElement("div");
    content.innerHTML = `<p class="meta">Failed to load preview.</p>`;
    console.error(err);
  }

  refs.viewer.appendChild(content);
};

const fetchText = async (path, full) => {
  const res = await fetch(path);
  const raw = await res.text();
  if (full) return { body: raw, truncated: false };

  const lines = raw.split(/\r?\n/);
  let limited = lines.slice(0, PREVIEW_LINE_LIMIT).join("\n");
  if (limited.length > PREVIEW_CHAR_LIMIT) {
    limited = limited.slice(0, PREVIEW_CHAR_LIMIT);
  }
  const truncated = raw.length > limited.length || lines.length > PREVIEW_LINE_LIMIT;
  return { body: limited, truncated };
};

const renderTablePreview = (csvText, delimiter, full) => {
  const container = document.createElement("div");
  const table = document.createElement("table");
  table.className = "table-preview";
  const rows = csvText.split(/\r?\n/).filter((r) => r.trim().length);
  const maxRows = full ? rows.length : Math.min(TABLE_ROW_LIMIT, rows.length);
  for (let i = 0; i < maxRows; i++) {
    const tr = document.createElement("tr");
    const cells = rows[i].split(delimiter).slice(0, TABLE_COL_LIMIT);
    cells.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  }
  container.appendChild(table);
  if (!full && rows.length > maxRows) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Table preview truncated. Toggle 'Show full previews' to see all rows/columns.";
    container.appendChild(note);
  }
  return container;
};

refs.fileSearch.addEventListener("input", applyFilter);
refs.refresh.addEventListener("click", () => {
  refs.fileSearch.value = "";
  state.showAll = false;
  refs.showAllToggle.checked = false;
  state.selected = null;
  refs.viewer.innerHTML = `<p class="meta">Choose a file to preview.</p>`;
  applyFilter();
});

refs.showAllToggle.addEventListener("change", (e) => {
  state.showAll = e.target.checked;
  if (state.selected) previewFile(state.selected);
});

refs.fileList.addEventListener("scroll", () => {
  const el = refs.fileList;
  if (!state.limited) return;
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
  if (nearBottom) {
    const next = state.filteredAll.slice(state.filtered.length, state.filtered.length + CHUNK_SIZE);
    if (next.length) {
      state.filtered = state.filtered.concat(next);
      state.limited = state.filtered.length < state.filteredAll.length;
      renderList();
    }
  }
});

// Start
loadManifest();
