let modal, image, closeButton, previousOverflow = "", previousPosition = "", previousTop = "", scrollY = 0;

function ensure() {
  if (modal) return;

  modal = document.createElement("div");
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Mission photo preview");
  modal.innerHTML = `
    <div data-preview-shell>
      <div data-preview-topbar>
        <button data-close type="button">✕ CLOSE</button>
      </div>
      <div data-preview-stage>
        <img data-image alt="Mission photo preview">
      </div>
    </div>`;

  Object.assign(modal.style, {
    position: "fixed",
    inset: "0",
    zIndex: "99999",
    background: "rgba(2, 6, 23, .97)",
    width: "100vw",
    height: "100dvh",
    overflow: "hidden",
    overscrollBehavior: "contain",
    touchAction: "pan-x pan-y"
  });

  const shell = modal.querySelector("[data-preview-shell]");
  Object.assign(shell.style, {
    width: "100%",
    height: "100%",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingRight: "env(safe-area-inset-right, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    paddingLeft: "env(safe-area-inset-left, 0px)"
  });

  const topbar = modal.querySelector("[data-preview-topbar]");
  Object.assign(topbar.style, {
    display: "flex",
    justifyContent: "flex-end",
    padding: "10px 12px 8px"
  });

  closeButton = modal.querySelector("[data-close]");
  Object.assign(closeButton.style, {
    background: "white",
    color: "#0f172a",
    border: "2px solid white",
    borderRadius: "12px",
    padding: "10px 14px",
    fontWeight: "900",
    fontSize: "12px",
    lineHeight: "1",
    boxShadow: "0 8px 24px rgba(0,0,0,.25)"
  });

  const stage = modal.querySelector("[data-preview-stage]");
  Object.assign(stage.style, {
    minWidth: "0",
    minHeight: "0",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px 12px",
    overflow: "hidden"
  });

  image = modal.querySelector("[data-image]");
  Object.assign(image.style, {
    display: "block",
    width: "auto",
    height: "auto",
    maxWidth: "calc(100vw - 20px)",
    maxHeight: "calc(100dvh - 78px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
    objectFit: "contain",
    borderRadius: "12px",
    boxShadow: "0 16px 50px rgba(0,0,0,.45)"
  });

  document.body.appendChild(modal);
  closeButton.addEventListener("click", closePhotoPreview);
  modal.addEventListener("click", event => {
    if (event.target === modal || event.target === stage) closePhotoPreview();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) closePhotoPreview();
  });

  window.visualViewport?.addEventListener("resize", fitToVisualViewport);
  window.visualViewport?.addEventListener("scroll", fitToVisualViewport);
}

function fitToVisualViewport() {
  if (!modal || modal.hidden || !window.visualViewport) return;
  const viewport = window.visualViewport;
  modal.style.width = `${viewport.width}px`;
  modal.style.height = `${viewport.height}px`;
  modal.style.left = `${viewport.offsetLeft}px`;
  modal.style.top = `${viewport.offsetTop}px`;
  modal.style.right = "auto";
  modal.style.bottom = "auto";
  if (image) image.style.maxHeight = `${Math.max(120, viewport.height - 78)}px`;
}

export function openPhotoPreview(url) {
  if (!url) return;
  ensure();

  image.src = url;
  modal.hidden = false;
  fitToVisualViewport();

  scrollY = window.scrollY;
  previousOverflow = document.body.style.overflow;
  previousPosition = document.body.style.position;
  previousTop = document.body.style.top;
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = "100%";
  closeButton.focus({ preventScroll: true });
}

export function closePhotoPreview() {
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (image) image.removeAttribute("src");

  document.body.style.overflow = previousOverflow;
  document.body.style.position = previousPosition;
  document.body.style.top = previousTop;
  document.body.style.width = "";
  window.scrollTo(0, scrollY);

  modal.style.inset = "0";
  modal.style.width = "100vw";
  modal.style.height = "100dvh";
  modal.style.left = "0";
  modal.style.top = "0";
}
