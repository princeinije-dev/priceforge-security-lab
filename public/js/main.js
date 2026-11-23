document.addEventListener("DOMContentLoaded", () => {
  // Mobile sidebar toggle for Admin Panel
  const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
  const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
  const adminSidebar = document.getElementById("adminSidebar");

  if (sidebarToggleBtn && adminSidebar) {
    sidebarToggleBtn.addEventListener("click", () => {
      adminSidebar.classList.toggle("open");
    });
  }

  if (sidebarCloseBtn && adminSidebar) {
    sidebarCloseBtn.addEventListener("click", () => {
      adminSidebar.classList.remove("open");
    });
  }

  // Auto-dismiss or manual close for flash alerts
  const flashAlerts = document.querySelectorAll(".flash-alert");
  flashAlerts.forEach((alert) => {
    const closeBtn = alert.querySelector(".flash-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        alert.remove();
      });
    }
  });

  // Confirm delete or sensitive actions
  const destructiveForms = document.querySelectorAll("form[data-confirm]");
  destructiveForms.forEach((form) => {
    form.addEventListener("submit", (e) => {
      const msg = form.getAttribute("data-confirm") || "Are you sure you want to proceed?";
      if (!confirm(msg)) {
        e.preventDefault();
      }
    });
  });
});
