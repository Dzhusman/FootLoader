const socket = io();

// LocalStorage для изображений
const imagesInStorage = JSON.parse(
  localStorage.getItem("__foot_images_loader") || "{}"
);

const getImageBase64FromStorage = (url) => {
  return imagesInStorage?.[url] || null;
};

const saveImageToStorage = (url, base64) => {
  imagesInStorage[url] = base64;
  localStorage.setItem(
    "__foot_images_loader",
    JSON.stringify(imagesInStorage)
  );
};

const initForm = document.querySelector("form#InitializeForm");
const errorContent = document.querySelector("span#error-content");
const backToSearchBtn = document.querySelector("button#back-to-search");
const downloadBtn = document.querySelector("button#download-selected-searchs");

const socketStatus = {
  el: document.querySelector("p#socket-status"),
  texts: {
    pending: "Pending...",
    connected: "Connected",
    disconnected: "Closed",
  },
};

const sections = {
  sendCode: document.querySelector("section#send-code"),
  loading: document.querySelector("section#loading"),
  error: document.querySelector("section#error"),
  searchResults: document.querySelector("section#search-results"),
  downloading: document.querySelector("section#downloading"),
  downloaded: document.querySelector("section#downloaded"),
};

const templates = {
  searchResultImage: document.querySelector(
    ".templates li#search-image-template"
  ),
  downloadedImage: document.querySelector(
    ".templates li#downloaded-image-template"
  ),
};

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    "Bytes",
    "KiB",
    "MiB",
    "GiB",
    "TiB",
  ];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const showError = (message) => {
  errorContent.textContent = message;
  toggleSection(sections.error, true);
};

const toggleSection = (section, value) => {
  section.setAttribute("data-show", value ? "true" : "false");
};

const hideAllSections = () => {
  for (const section of Object.values(sections)) {
    toggleSection(section, false);
  }
};

const renderDownloaded = () => {
  const images = Object.entries(imagesInStorage);

  const ul = sections.downloaded.querySelector("ul");

  ul.innerHTML = "";

  if (images.length === 0) {
    toggleSection(sections.downloaded, false);
    return;
  }

  toggleSection(sections.downloaded, true);

  for (const [url, base64] of images) {
    const li = templates.downloadedImage.cloneNode(true);
    const img = li.querySelector("img");
    const button = li.querySelector("button");

    li.setAttribute("data-url", url);
    img.src = base64;

    button.addEventListener("click", () => {
      delete imagesInStorage[url];
      localStorage.setItem(
        "__foot_images_loader",
        JSON.stringify(imagesInStorage)
      );

      renderDownloaded();
    });

    ul.appendChild(li);
  }
};

const showDownloaded = () => renderDownloaded();

renderDownloaded();

// Отправка ключевого слова из формы поиска
initForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const formData = new FormData(initForm);
  const code = formData.get("code");

  if (!code) {
    return alert("Please enter code");
  }

  if (!socket) {
    return alert("Socket is not connected");
  }

  socket.emit("search-by-code", String(code).toLowerCase().trim());

  hideAllSections();
  toggleSection(sections.loading, true);
});

// Статус socket
socket.on("connect", () => {
  socketStatus.el.textContent = socketStatus.texts.connected;
  socketStatus.el.setAttribute("data-status", "true");
});

socket.on("disconnect", () => {
  socketStatus.el.textContent = socketStatus.texts.disconnected;
  socketStatus.el.setAttribute("data-status", "false");
});

let selectedImages = new Set();

const renderDownloadBtn = () => {
  const values = Array.from(selectedImages.values());

  if (values.length > 0) {
    return downloadBtn.removeAttribute("disabled");
  }

  downloadBtn.setAttribute("disabled", "true");
};

// Результаты поиска
socket.on("search-by-code-result", (images) => {
  hideAllSections();

  if (!Array.isArray(images)) {
    toggleSection(sections.sendCode, true);
    showDownloaded();
    return showError("Invalid response from server");
  }

  if (images.length === 0) {
    toggleSection(sections.sendCode, true);
    showDownloaded();
    return showError("No images found");
  }

  const listOfImages = sections.searchResults.querySelector("ul");

  selectedImages.clear();
  listOfImages.innerHTML = "";
  toggleSection(sections.searchResults, true);

  for (const url of images) {
    const li = templates.searchResultImage.cloneNode(true);
    const img = li.querySelector("img");
    const title = li.querySelector("h3");
    const status = li.querySelector("p#status");
    const button = li.querySelector("button");

    const srcFromStorage = getImageBase64FromStorage(url);

    if (srcFromStorage) {
      status.textContent = "Loaded from storage";
      button?.remove();
    } else {
      li.querySelector("button").addEventListener("click", (e) => {
        let newIsActive = false;

        if (selectedImages.has(url)) {
          selectedImages.delete(url);
        } else {
          selectedImages.add(url);
          newIsActive = true;
        }

        e.currentTarget.setAttribute("data-active", newIsActive);
        renderDownloadBtn();
      });
    }

    li.setAttribute("data-url", url);
    img.src = srcFromStorage || url;
    title.textContent = url;

    listOfImages.appendChild(li);
  }
});

backToSearchBtn.addEventListener("click", () => {
  hideAllSections();
  toggleSection(sections.sendCode, true);
  showDownloaded();
});

downloadBtn.addEventListener("click", () => {
  const values = Array.from(selectedImages.values());

  if (values.length === 0) {
    return;
  }

  socket.emit("download-images", values);

  // Неактивная кнопка Download
  downloadBtn.setAttribute("disabled", "true");

  sections.searchResults.querySelectorAll("li").forEach((li) => {
    const url = li.getAttribute("data-url");

    if (!selectedImages.has(url)) {
      return;
    }

    li.querySelector("button")?.remove();
    li.querySelector("p#status").textContent = "In quoue...";
    li.querySelector("div#progress-of-downloading").setAttribute(
      "data-show",
      "true"
    );
  });

  toggleSection(sections.downloading, true);
});

socket.on("download-progress", (url, data) => {
  const li = sections.searchResults.querySelector(`li[data-url="${url}"]`);
  const statusEl = li.querySelector("p#status");
  const percentEl = li.querySelector("p#percent");
  const progressBarEl = li.querySelector("div#progress-bar");
  const downloadedSizeEl = li.querySelector("p#downloaded-size");
  const speedEl = li.querySelector("p#speed");
  const totalSizeEl = li.querySelector("p#total-size");

  statusEl.textContent = "Downloading...";

  const totalSize = formatBytes(data.total);
  const downloadedSize = formatBytes(data.proceeded);
  const percent = Math.round((data.proceeded / data.total) * 100);

  const prevDownloadedBytes =
    Number(downloadedSizeEl.getAttribute("data-bytes")) || 0;

  const speed = formatBytes(data.proceeded - prevDownloadedBytes) + "/s";

  speedEl.textContent = speed;
  percentEl.textContent = percent + "%";
  progressBarEl.style.width = percent + "%";
  downloadedSizeEl.setAttribute("data-bytes", data.proceeded);
  downloadedSizeEl.textContent = downloadedSize;
  totalSizeEl.textContent = totalSize;
});

socket.on("downloaded", (url, base64) => {
  const li = sections.searchResults.querySelector(`li[data-url="${url}"]`);

  li.querySelector("p#speed").textContent = "";
  li.querySelector("p#percent").textContent = "Downloaded and saved";
  li.querySelector("p#status").textContent = "Done";

  saveImageToStorage(url, base64);
  selectedImages.delete(url);

  if (selectedImages.size === 0) {
    showDownloaded();
    toggleSection(sections.sendCode, true);
    toggleSection(sections.searchResults, false);
  }
});
