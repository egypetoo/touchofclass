// Static preview only: injects the shared header / footer / loader markup and marks the current nav link.
// In Laravel these become Blade @include's with the active link set server-side, and this file is dropped.
function loadPartial(selector, url, done) {
  const el = document.querySelector(selector);
  if (!el) return;
  fetch(url)
    .then(function (res) { return res.ok ? res.text() : ""; })
    .then(function (html) {
      el.innerHTML = html;
      if (done) done();
    });
}

function setActiveLink() {
  // details pages keep their parent section active (project-details.html -> projects.html, news-details.html -> news.html)
  const page = window.location.pathname.split("/").pop() || "index.html";
  const parent = page.replace(/-details\.html$/, "");
  const matches = [page, parent + ".html", parent + "s.html"];

  document.querySelectorAll(".header .nav-link").forEach(function (link) {
    const href = (link.getAttribute("href") || "").replace("./", "");
    link.classList.toggle("active", matches.includes(href));
  });
}
