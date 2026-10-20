// ===== GSAP Animations + Lenis smooth scroll =====
// Only transform / opacity are animated (plus one clip-path reveal) so everything stays on the compositor.
// Scroll-driven entrances use IntersectionObserver: no per-frame scroll math for elements off screen.
const hasGSAP = typeof gsap !== "undefined";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionOn = hasGSAP && !reduceMotion;
// direction comes from <html dir>, so read the computed value; +1 = enter from the reading-start side
const DIR = getComputedStyle(document.documentElement).direction === "rtl" ? 1 : -1;

if (typeof Swiper !== "undefined" && Swiper.extendDefaults) {
  Swiper.extendDefaults({
    a11y: {
      prevSlideMessage: "الشريحة السابقة",
      nextSlideMessage: "الشريحة التالية",
      firstSlideMessage: "هذه أول شريحة",
      lastSlideMessage: "هذه آخر شريحة",
      paginationBulletMessage: "انتقل إلى الشريحة {{index}}",
    },
  });
}
let animationsStarted = false;
const heroSwipers = [];
let heroTimeline = null;
let lenis = null;
const kmScenes = [];
let sceneObserver = null;

if (hasGSAP) {
  gsap.defaults({ ease: "power3.out", duration: 1 });
}

function initSmoothScroll() {
  if (reduceMotion || typeof Lenis === "undefined") return;

  lenis = new Lenis({
    lerp: 0.1,
    anchors: { offset: -92 },
    autoRaf: !hasGSAP,
  });

  // one shared frame loop for Lenis and GSAP
  if (hasGSAP) {
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
  }

  // the mobile menu locks the page; Lenis must not keep scrolling underneath it
  document.addEventListener("show.bs.offcanvas", function () {
    lenis.stop();
  });
  document.addEventListener("hidden.bs.offcanvas", function () {
    lenis.start();
  });
}

initSmoothScroll();

const ANIM_FROM = {
  up: { y: 48 },
  left: { x: 60 * DIR },
  right: { x: -60 * DIR },
  zoom: { scale: 0.92 },
};

// Hide targets while the loader still covers the page, so nothing flashes before its entrance.
// CSS transitions are disabled during the tween, otherwise they smear GSAP's per-frame values.
function prepareAnimations() {
  if (!motionOn) return;

  gsap.utils.toArray("[data-anim]").forEach(function (el) {
    const type = el.dataset.anim;

    if (type === "reveal") {
      gsap.set(el, { clipPath: "inset(0% 0% 0% 100%)" });
      gsap.set(el.querySelectorAll("img"), { scale: 1.25, transition: "none" });
      return;
    }

    gsap.set(el, Object.assign({ autoAlpha: 0, transition: "none" }, ANIM_FROM[type] || ANIM_FROM.up));
  });

  gsap.set(".page-banner-bg", { scale: 1.12 });
}

const BLOCK_DONE = { autoAlpha: 1, x: 0, y: 0, scale: 1, clearProps: "transform,opacity,visibility,transition" };

// IntersectionObserver only reports crossings, so a big jump (anchor link, fast fling) can carry an
// element from below the viewport to above it without it ever "entering". Finish those on scroll.
const passedWatch = new Map();

function watchPassed(el, onPassed) {
  passedWatch.set(el, onPassed);
  if (passedWatch.size === 1) window.addEventListener("scroll", checkPassed, { passive: true });
}

function unwatchPassed(el) {
  passedWatch.delete(el);
}

function checkPassed() {
  passedWatch.forEach(function (onPassed, el) {
    if (el.getBoundingClientRect().bottom >= 0) return;
    passedWatch.delete(el);
    onPassed();
  });
  if (!passedWatch.size) window.removeEventListener("scroll", checkPassed);
}

function finishAnim(el) {
  if (el.dataset.anim === "reveal") {
    gsap.set(el, { clearProps: "clipPath" });
    gsap.set(el.querySelectorAll("img"), { clearProps: "transform,transition" });
  } else {
    gsap.set(el, BLOCK_DONE);
  }
}

function revealImage(el) {
  gsap
    .timeline({ delay: parseFloat(el.dataset.animDelay) || 0 })
    .to(el, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.4, ease: "expo.inOut", clearProps: "clipPath" })
    .to(el.querySelectorAll("img"), { scale: 1, duration: 1.8, ease: "expo.out", clearProps: "transform,transition" }, 0.2);
}

function initScrollAnimations() {
  const observer = new IntersectionObserver(
    function (entries) {
      const entering = [];

      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entering.push(entry.target);
          observer.unobserve(entry.target);
          unwatchPassed(entry.target);
        } else if (entry.boundingClientRect.bottom < 0) {
          // already scrolled past (e.g. restored scroll position): show it without replaying
          observer.unobserve(entry.target);
          unwatchPassed(entry.target);
          finishAnim(entry.target);
        }
      });

      // entries arrive in document order, so elements entering together get a natural stagger
      const blocks = entering.filter(function (el) { return el.dataset.anim !== "reveal"; });
      if (blocks.length) {
        gsap.to(blocks, Object.assign({ duration: 1.1, stagger: 0.12, overwrite: true }, BLOCK_DONE));
      }
      entering.filter(function (el) { return el.dataset.anim === "reveal"; }).forEach(revealImage);
    },
    { rootMargin: "0px 0px -12% 0px" }
  );

  document.querySelectorAll("[data-anim]").forEach(function (el) {
    observer.observe(el);
    watchPassed(el, function () {
      observer.unobserve(el);
      finishAnim(el);
    });
  });

  initParallax();
}

// desktop-only and only while on screen; on touch devices it costs more than it gives
function initParallax() {
  const items = gsap.utils.toArray("[data-parallax]");
  if (!items.length) return;

  gsap.matchMedia().add("(min-width: 992px)", function () {
    const onScreen = new Set();
    const setters = new Map();
    const visibility = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      });
    });

    items.forEach(function (el) {
      gsap.set(el, { scale: 1.12 });
      setters.set(el, gsap.quickTo(el, "yPercent", { duration: 0.4, ease: "power3.out" }));
      visibility.observe(el);
    });

    function update() {
      onScreen.forEach(function (el) {
        const box = el.parentElement.getBoundingClientRect();
        const progress = (window.innerHeight - box.top) / (window.innerHeight + box.height);
        setters.get(el)(gsap.utils.clamp(-6, 6, -6 + progress * 12));
      });
    }

    update();
    window.addEventListener("scroll", update, { passive: true });

    return function () {
      window.removeEventListener("scroll", update);
      visibility.disconnect();
      gsap.set(items, { clearProps: "transform" });
    };
  });
}

function playIntro() {
  const intro = gsap.timeline();

  intro.from(".header", { yPercent: -100, duration: 0.9, clearProps: "transform" });

  if (document.querySelector(".page-banner-bg")) {
    intro.to(".page-banner-bg", { scale: 1, duration: 2.4, ease: "power2.out", clearProps: "transform" }, 0);
  }
}

// ----- Hero slides -----
function prepareHeroSlides(hero) {
  if (!motionOn) return;

  hero.querySelectorAll(".hero-title > span").forEach(function (line) {
    line.classList.add("hero-line");
    line.innerHTML = '<span class="hero-line-inner">' + line.innerHTML + "</span>";
  });

  gsap.set(hero.querySelectorAll(".hero-mark"), { autoAlpha: 0, scale: 0.72, rotate: -8, transformOrigin: "50% 50%" });
  gsap.set(hero.querySelectorAll(".hero-line-inner"), { yPercent: 110 });
  gsap.set(hero.querySelectorAll(".hero-brand-text, .hero-copy, .hero-actions > *"), { autoAlpha: 0 });
}

function animateHeroSlide(slide) {
  if (!motionOn || !animationsStarted || !slide) return;

  // the outgoing slide is fading away anyway; snap it to its end state instead of leaving it half-built
  if (heroTimeline) heroTimeline.progress(1).kill();

  const q = gsap.utils.selector(slide);
  const fadeIn = { autoAlpha: 1, x: 0, y: 0, clearProps: "all" };

  heroTimeline = gsap
    .timeline()
    .fromTo(q(".hero-slide-bg, .hero-mobile-img"), { scale: 1.12 }, { scale: 1, duration: 7, ease: "power1.out" }, 0)
    .fromTo(
      q(".hero-mark"),
      { autoAlpha: 0, scale: 0.72, rotate: -8 },
      { autoAlpha: 1, scale: 1, rotate: 0, duration: 1.15, ease: "back.out(1.7)", clearProps: "transform" },
      0.1
    )
    .fromTo(q(".hero-brand-text"), { autoAlpha: 0, x: 24 * DIR }, Object.assign({ duration: 0.9 }, fadeIn), 0.3)
    .fromTo(q(".hero-line-inner"), { yPercent: 110 }, { yPercent: 0, duration: 1.1, ease: "power4.out", stagger: 0.12 }, 0.35)
    .fromTo(q(".hero-copy"), { autoAlpha: 0, y: 20 }, Object.assign({ duration: 0.9 }, fadeIn), 0.65)
    .fromTo(
      q(".hero-actions > *"),
      { autoAlpha: 0, y: 20, transition: "none" },
      Object.assign({ duration: 0.8, stagger: 0.1 }, fadeIn),
      0.8
    );
}

function startAnimations() {
  if (animationsStarted) return;
  animationsStarted = true;
  if (!motionOn) return;

  playIntro();

  heroSwipers.forEach(function (swiper) {
    animateHeroSlide(swiper.slides[swiper.activeIndex]);
    swiper.autoplay.start();
  });

  initScrollAnimations();
  initServiceCards();
  initScenes();
}

// ----- Service cards -----
// 3D rise on entrance, photo wipe, then copy and button; mouse-follow tilt + glare on hover.
function prepareServiceCards() {
  if (!motionOn) return;

  gsap.utils.toArray(".service-card").forEach(function (card) {
    const q = gsap.utils.selector(card);
    gsap.set(card, { autoAlpha: 0, y: 90, rotateX: -28, scale: 0.92, transformPerspective: 1100, transformOrigin: "50% 100%" });
    gsap.set(q(".service-card-media"), { clipPath: "inset(100% 0% 0% 0%)" });
    gsap.set(q(".service-card-img"), { scale: 1.45, transition: "none" });
    gsap.set(q(".service-card-title, .service-card-desc"), { y: 24, autoAlpha: 0 });
    gsap.set(q(".service-card-btn"), { scale: 0, rotate: -180, transition: "none" });
  });
}

function playServiceCard(card, delay) {
  const q = gsap.utils.selector(card);

  return gsap
    .timeline({ delay: delay })
    .to(card, { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 1.2, ease: "expo.out", clearProps: "opacity,visibility" })
    .to(q(".service-card-media"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, ease: "expo.inOut", clearProps: "clipPath" }, 0.1)
    .to(q(".service-card-img"), { scale: 1.1, duration: 1.6, ease: "expo.out", clearProps: "transform,transition" }, 0.2)
    .to(q(".service-card-title, .service-card-desc"), { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1, ease: "power3.out", clearProps: "all" }, 0.65)
    .to(q(".service-card-btn"), { scale: 1, rotate: 0, duration: 0.8, ease: "back.out(2.2)", clearProps: "transform,transition" }, 0.95);
}

function initServiceCards() {
  const cards = gsap.utils.toArray(".service-card");
  if (!cards.length) return;

  const observer = new IntersectionObserver(
    function (entries) {
      const entering = entries.filter(function (entry) { return entry.isIntersecting; }).map(function (entry) { return entry.target; });
      entering.forEach(function (card, i) {
        observer.unobserve(card);
        unwatchPassed(card);
        playServiceCard(card, i * 0.15);
      });

      entries.forEach(function (entry) {
        if (entry.isIntersecting || entry.boundingClientRect.bottom >= 0) return;
        observer.unobserve(entry.target);
        unwatchPassed(entry.target);
        playServiceCard(entry.target, 0).progress(1);
      });
    },
    { rootMargin: "0px 0px -10% 0px" }
  );

  cards.forEach(function (card) {
    observer.observe(card);
    watchPassed(card, function () {
      observer.unobserve(card);
      playServiceCard(card, 0).progress(1);
    });
  });
  initServiceCardTilt(cards);
}

function initServiceCardTilt(cards) {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  cards.forEach(function (card) {
    const glare = document.createElement("span");
    glare.className = "service-card-glare";
    glare.setAttribute("aria-hidden", "true");
    card.appendChild(glare);

    const rotX = gsap.quickTo(card, "rotateX", { duration: 0.5, ease: "power3.out" });
    const rotY = gsap.quickTo(card, "rotateY", { duration: 0.5, ease: "power3.out" });

    card.addEventListener("pointerenter", function () {
      gsap.to(card, { y: -10, scale: 1.02, transformPerspective: 1100, transformOrigin: "50% 50%", duration: 0.5, ease: "power3.out" });
    });

    card.addEventListener("pointermove", function (e) {
      const box = card.getBoundingClientRect();
      const px = (e.clientX - box.left) / box.width;
      const py = (e.clientY - box.top) / box.height;
      rotY((px - 0.5) * 14);
      rotX((0.5 - py) * 12);
      card.style.setProperty("--glare-x", px * 100 + "%");
      card.style.setProperty("--glare-y", py * 100 + "%");
    });

    card.addEventListener("pointerleave", function () {
      gsap.to(card, { y: 0, scale: 1, rotateX: 0, rotateY: 0, duration: 0.7, ease: "power3.out" });
    });
  });
}

prepareAnimations();
prepareServiceCards();

// Loader
function hideLoader() {
  const loading = document.querySelector(".loading");
  if (!loading || loading.classList.contains("loaded")) return;
  loading.classList.add("loaded");

  if (!motionOn) {
    loading.style.display = "none";
    startAnimations();
    return;
  }

  gsap
    .timeline({
      onComplete: function () {
        loading.style.display = "none";
      },
    })
    .to(loading.querySelectorAll(".loader-container"), { autoAlpha: 0, scale: 0.9, duration: 0.4, ease: "power2.in" })
    .to(loading, { yPercent: -100, duration: 0.9, ease: "power4.inOut" })
    .add(startAnimations, "-=0.45");
}

window.addEventListener("load", hideLoader);
// don't keep the page hidden if a heavy asset is slow to load
setTimeout(hideLoader, 3000);

// Back To Top
const backTop = document.getElementById("back-top");

function toggleBackTop() {
  backTop.classList.toggle("show", window.scrollY > 100);
}

backTop.addEventListener("click", function () {
  if (lenis) {
    lenis.scrollTo(0, { duration: 1.4 });
    return;
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

// Header
let nav = document.querySelector(".header");
let navHeight = nav.offsetHeight;

function toggleHeader() {
  let scrollTop = window.scrollY;

  if (scrollTop > navHeight) {
    nav.classList.add("fixed");
  } else {
    nav.classList.remove("fixed");
  }
}

// ===== Header search =====
// Its index is read from the header menu links, so products are only listed once (in header.html).
let kmSearchIndex = null;

function escapeHTML(text) {
  return text.replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function markTerm(text, term) {
  const i = term ? text.toLowerCase().indexOf(term) : -1;
  if (i < 0) return escapeHTML(text);
  return escapeHTML(text.slice(0, i)) + "<mark>" + escapeHTML(text.slice(i, i + term.length)) + "</mark>" + escapeHTML(text.slice(i + term.length));
}

function buildSearchIndex() {
  const header = document.querySelector(".header");
  const catName = function (link) { return link.querySelector(".km-dd-text").firstChild.textContent.trim(); };

  const cats = Array.from(header.querySelectorAll(".km-dd-item > a")).map(function (a) {
    const count = a.querySelector(".km-dd-text small");
    return { name: catName(a), meta: count ? count.textContent : "", href: a.getAttribute("href"), cat: a.dataset.cat, icon: a.querySelector(".km-dd-icon i").className };
  });
  const products = Array.from(header.querySelectorAll(".km-dd-sub a")).map(function (a) {
    return { name: a.textContent.trim(), meta: catName(a.closest(".km-dd-item").querySelector(":scope > a")), href: a.getAttribute("href"), img: a.dataset.img };
  });
  const pages = Array.from(header.querySelectorAll(".navbar-collapse .nav-link")).filter(function (a) {
    return !a.closest(".km-nav-dd");
  }).map(function (a) {
    return { name: a.textContent.trim(), meta: "صفحة", href: a.getAttribute("href"), icon: "fa-solid fa-file-lines" };
  });

  return { cats: cats, products: products, pages: pages };
}

function searchItemHTML(item, term) {
  const thumb = item.img
    ? '<img class="km-search-thumb" src="' + item.img + '" alt="" width="48" height="48" loading="lazy" />'
    : '<span class="km-search-thumb is-icon"><i class="' + item.icon + '"></i></span>';
  return (
    '<a class="km-search-item" href="' + item.href + '"' + (item.cat ? ' data-cat="' + item.cat + '"' : "") + ">" +
    thumb +
    '<span class="km-search-info"><strong>' + markTerm(item.name, term) + "</strong><small>" + escapeHTML(item.meta) + "</small></span>" +
    '<i class="fa-solid fa-arrow-left km-search-go"></i></a>'
  );
}

function renderSearch() {
  const panel = document.getElementById("km-search-panel");
  if (!panel) return;
  if (!kmSearchIndex) kmSearchIndex = buildSearchIndex();

  const results = panel.querySelector(".km-search-results");
  const raw = panel.querySelector("#km-search-input").value.trim();
  const term = raw.toLowerCase();
  const allLink = '<a class="km-search-more" href="./projects.html">عرض كل المشاريع <i class="fa-solid fa-arrow-left"></i></a>';

  if (!term) {
    const chips = kmSearchIndex.cats.map(function (c) {
      return '<a href="' + c.href + '" data-cat="' + c.cat + '"><i class="' + c.icon + '"></i>' + escapeHTML(c.name) + "</a>";
    }).join("");
    results.innerHTML =
      '<p class="km-search-label">تصفح الفئات</p><div class="km-search-chips">' + chips + "</div>" +
      '<p class="km-search-label">مشاريع مقترحة</p>' +
      kmSearchIndex.products.slice(0, 4).map(function (p) { return searchItemHTML(p, ""); }).join("") +
      allLink;
    return;
  }

  const match = function (item) { return item.name.toLowerCase().includes(term) || item.meta.toLowerCase().includes(term); };
  const found = kmSearchIndex.cats.filter(match).concat(kmSearchIndex.products.filter(match), kmSearchIndex.pages.filter(match));

  if (!found.length) {
    results.innerHTML = '<p class="km-search-empty"><i class="fa-solid fa-magnifying-glass-minus"></i>لا توجد نتائج لـ «' + escapeHTML(raw) + "»</p>";
    return;
  }

  results.innerHTML =
    '<p class="km-search-label">' + found.length + " نتيجة</p>" +
    found.slice(0, 8).map(function (item) { return searchItemHTML(item, term); }).join("") +
    allLink;
}

// open/close is Bootstrap Collapse (data-bs-toggle on both header toggles + the close button)
function hideSearch() {
  const panel = document.getElementById("km-search-panel");
  if (panel && panel.classList.contains("show")) bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false }).hide();
}

document.addEventListener("show.bs.collapse", function (e) {
  if (e.target.id === "km-search-panel") renderSearch();
});

document.addEventListener("shown.bs.collapse", function (e) {
  if (e.target.id === "km-search-panel") e.target.querySelector("#km-search-input").focus();
});

let searchRenderTimer = null;
document.addEventListener("input", function (e) {
  if (e.target.id !== "km-search-input") return;
  clearTimeout(searchRenderTimer);
  searchRenderTimer = setTimeout(renderSearch, 120);
});

document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  const panel = document.getElementById("km-search-panel");
  if (!panel || !panel.classList.contains("show")) return;
  hideSearch();
  const toggle = Array.from(document.querySelectorAll(".km-search-toggle")).find(function (btn) { return btn.offsetParent; });
  if (toggle) toggle.focus();
});

document.addEventListener("click", function (e) {
  const panel = document.getElementById("km-search-panel");
  if (!panel || !panel.classList.contains("show")) return;
  if (!panel.contains(e.target) && !e.target.closest(".km-search-toggle")) hideSearch();
});

// Category links (menu, search) switch the catalog tab in place when the page has one
document.addEventListener("click", function (e) {
  const link = e.target.closest(".header a[data-cat]");
  if (!link) return;
  const tab = document.querySelector('.km-tab[data-cat="' + link.dataset.cat + '"]');
  if (!tab) return;

  e.preventDefault();
  hideSearch();
  link.blur();
  if (!tab.classList.contains("active")) tab.click();
  const target = document.querySelector(".km-products-tabs");
  if (lenis) lenis.scrollTo(target, { offset: -110, duration: 1.2 });
  else target.scrollIntoView({ behavior: "smooth" });
});

let scrollTicking = false;

function onScroll() {
  toggleHeader();
  toggleBackTop();
  scrollTicking = false;
}

onScroll();
window.addEventListener(
  "scroll",
  function () {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(onScroll);
  },
  { passive: true }
);

// ===== Hero Slider (Swiper) =====
function initHeroSlider(hero) {
  if (typeof Swiper === "undefined" || !hero.querySelector(".hero-slider")) return;

  const numEl = hero.querySelector(".hero-index-num");
  const trackBar = hero.querySelector(".hero-index-bar");
  const dots = hero.querySelectorAll(".hero-index-dot, .hero-mobile-dot");
  const slideCount = hero.querySelectorAll(".hero-slide").length;

  function updateIndicators(swiper) {
    const index = swiper.realIndex;

    dots.forEach(function (dot) {
      dot.classList.toggle("active", Number(dot.dataset.index) === index);
    });

    if (numEl) numEl.textContent = String(index + 1).padStart(2, "0");
    if (trackBar) trackBar.style.top = (index * 100) / slideCount + "%";
  }

  prepareHeroSlides(hero);

  const heroSwiper = new Swiper(hero.querySelector(".hero-slider"), {
    effect: "fade",
    fadeEffect: { crossFade: true },
    loop: true,
    speed: 900,
    autoplay: {
      delay: 6000,
      disableOnInteraction: false,
      pauseOnMouseEnter: true,
    },
    keyboard: {
      enabled: true,
      onlyInViewport: true,
    },
    navigation: {
      nextEl: hero.querySelector(".hero-next"),
      prevEl: hero.querySelector(".hero-prev"),
    },
    on: {
      init: updateIndicators,
      slideChange: updateIndicators,
      slideChangeTransitionStart: function (swiper) {
        animateHeroSlide(swiper.slides[swiper.activeIndex]);
      },
    },
  });

  // autoplay waits for the intro, so the first slide isn't cut short while the loader is up
  if (motionOn) heroSwiper.autoplay.stop();
  heroSwipers.push(heroSwiper);

  dots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      heroSwiper.slideToLoop(Number(this.dataset.index));
    });
  });
}

document.querySelectorAll("section.hero").forEach(initHeroSlider);

function initServicesSlider() {
  const slider = document.querySelector(".services-swiper");
  if (!slider || typeof Swiper === "undefined") return;

  const wrap = slider.closest(".services-km-slider");
  new Swiper(slider, {
    speed: 700,
    grabCursor: true,
    watchOverflow: true,
    slidesPerView: "auto",
    spaceBetween: 22,
    navigation: {
      prevEl: wrap.querySelector(".services-km-prev"),
      nextEl: wrap.querySelector(".services-km-next"),
    },
  });
}

initServicesSlider();

// only the first slide's photo is needed for the first paint; the rest load once the page is in
function loadHeroBackgrounds() {
  document.querySelectorAll(".hero-slide[data-bg]").forEach(function (slide) {
    slide.style.setProperty("--slide-bg", 'url("' + new URL(slide.dataset.bg, document.baseURI).href + '")');
  });
}

if (document.readyState === "complete") loadHeroBackgrounds();
else window.addEventListener("load", loadHeroBackgrounds);

// ===== Project Details Slider (Swiper + Fancybox) =====
function initProjectSlider() {
  const slider = document.querySelector(".project-swiper");
  if (!slider || typeof Swiper === "undefined") return;

  const wrap = slider.closest(".details-slider");

  new Swiper(slider, {
    loop: true,
    speed: 800,
    grabCursor: true,
    autoplay: {
      delay: 5000,
      disableOnInteraction: false,
      pauseOnMouseEnter: true,
    },
    navigation: {
      prevEl: wrap.querySelector(".details-slider-prev"),
      nextEl: wrap.querySelector(".details-slider-next"),
    },
    pagination: {
      el: wrap.querySelector(".details-slider-count"),
      type: "fraction",
      formatFractionCurrent: function (n) { return String(n).padStart(2, "0"); },
      formatFractionTotal: function (n) { return String(n).padStart(2, "0"); },
    },
  });

  if (typeof Fancybox !== "undefined") {
    Fancybox.bind("[data-fancybox='project-gallery']", {});
  }
}

initProjectSlider();

// ===== Products catalog (Bootstrap tabs + search + sort + slider) =====
function initProductsCatalog() {
  const section = document.querySelector(".km-products");
  if (!section) return;

  const titleEl = section.querySelector("#km-cat-title");
  const descEl = section.querySelector("#km-cat-desc");
  const search = section.querySelector("#km-product-search");
  const sort = section.querySelector("#km-product-sort");
  const tabs = section.querySelectorAll(".km-tab");
  const viewInputs = section.querySelectorAll('.km-view-toggle input[name="km-view"]');
  const checkedView = section.querySelector('.km-view-toggle input[name="km-view"]:checked');
  let view = checkedView ? checkedView.value : "grid";

  // each tab pane keeps its own cards (written in the HTML) and its own slider
  const panes = Array.from(section.querySelectorAll(".km-products-panes .tab-pane")).map(function (el) {
    const wrapper = el.querySelector(".swiper-wrapper");
    return {
      el: el,
      wrapper: wrapper,
      swiperEl: el.querySelector(".km-products-swiper"),
      empty: el.querySelector(".km-products-empty"),
      swiper: null,
      slides: Array.from(wrapper.querySelectorAll(".swiper-slide")).map(function (slide) {
        return { el: slide, value: +slide.dataset.value || 0, name: slide.querySelector(".km-product-name").textContent.trim() };
      }),
    };
  });

  if (!panes.length || !search || !sort) return;

  function paneOf(el) {
    return panes.find(function (p) { return p.el === el; });
  }

  function activePane() {
    return panes.find(function (p) { return p.el.classList.contains("active"); }) || panes[0];
  }

  function currentItems(pane) {
    const term = search.value.trim().toLowerCase();
    const items = pane.slides.filter(function (item) {
      return !term || item.name.toLowerCase().includes(term);
    });
    if (sort.value === "name") items.sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (sort.value === "value-asc") items.sort(function (a, b) { return a.value - b.value; });
    if (sort.value === "value-desc") items.sort(function (a, b) { return b.value - a.value; });
    return items;
  }

  function destroySwiper(pane) {
    if (!pane.swiper) return;
    pane.swiper.destroy(true, true);
    pane.swiper = null;
  }

  function buildSwiper(pane) {
    destroySwiper(pane);
    if (view !== "grid" || typeof Swiper === "undefined") return;

    pane.swiper = new Swiper(pane.swiperEl, {
      slidesPerView: 1.15,
      spaceBetween: 16,
      speed: 700,
      grabCursor: true,
      watchOverflow: true,
      navigation: { prevEl: pane.el.querySelector(".km-products-prev"), nextEl: pane.el.querySelector(".km-products-next") },
      pagination: { el: pane.el.querySelector(".km-products-dots"), clickable: true },
      breakpoints: {
        576: { slidesPerView: 2, spaceBetween: 18 },
        992: { slidesPerView: 3, spaceBetween: 20 },
        1200: { slidesPerView: 4, spaceBetween: 22 },
      },
    });
  }

  function render(pane, animate) {
    const items = currentItems(pane);
    destroySwiper(pane);
    pane.wrapper.replaceChildren.apply(pane.wrapper, items.map(function (item) { return item.el; }));
    if (pane.empty) pane.empty.hidden = items.length > 0;
    section.classList.toggle("is-list", view === "list");
    buildSwiper(pane);

    if (animate) animateProductCards(pane.wrapper.querySelectorAll(".km-product-card"));
  }

  function setHeading(tab, animate) {
    const apply = function () {
      titleEl.textContent = tab.querySelector(".km-tab-text strong").textContent;
      descEl.textContent = tab.dataset.desc || "";
    };
    if (!animate || !motionOn) return apply();
    gsap.to([titleEl, descEl], {
      autoAlpha: 0,
      y: -14,
      duration: 0.2,
      stagger: 0.04,
      ease: "power2.in",
      overwrite: true,
      onComplete: function () {
        apply();
        gsap.fromTo([titleEl, descEl], { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08, clearProps: "all" });
      },
    });
  }

  // old cards fold away, then the same pane is rebuilt and flies back in (sort / view changes)
  let refreshTween = null;
  function refresh() {
    const pane = activePane();
    if (!motionOn) return render(pane, false);

    if (refreshTween) refreshTween.kill();
    const oldCards = pane.wrapper.querySelectorAll(".km-product-card");
    refreshTween = gsap.to(oldCards, {
      autoAlpha: 0,
      y: -40,
      rotateX: 22,
      scale: 0.94,
      transformPerspective: 1000,
      duration: 0.35,
      stagger: 0.04,
      ease: "power2.in",
      overwrite: true,
      onComplete: function () { render(pane, true); },
    });
    if (!oldCards.length) refreshTween.progress(1);
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("show.bs.tab", function () {
      const pane = paneOf(section.querySelector(tab.dataset.bsTarget));
      search.value = "";
      setHeading(tab, true);
      // keep the incoming cards hidden through Bootstrap's fade so they can fly in once the pane is shown
      if (motionOn && pane) gsap.set(pane.wrapper.querySelectorAll(".km-product-card"), { autoAlpha: 0 });
      if (motionOn) {
        gsap.fromTo(
          tab.querySelector(".km-tab-icon"),
          { rotate: -200, scale: 0.4 },
          { rotate: 0, scale: 1, duration: 0.9, ease: "back.out(2.2)", clearProps: "transform" }
        );
      }
    });

    tab.addEventListener("shown.bs.tab", function (e) {
      const pane = paneOf(section.querySelector(tab.dataset.bsTarget));
      if (pane) render(pane, true);
      const prev = e.relatedTarget && paneOf(section.querySelector(e.relatedTarget.dataset.bsTarget));
      if (prev) destroySwiper(prev);
    });
  });

  viewInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      if (!input.checked) return;
      view = input.value;
      refresh();
    });
  });

  let searchTimer = null;
  search.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { render(activePane(), true); }, 200);
  });
  sort.addEventListener("change", refresh);

  const firstTab = section.querySelector(".km-tab.active") || tabs[0];
  if (firstTab) setHeading(firstTab, false);
  if (panes.length) render(activePane(), false);
}

function animateProductCards(cards, delay) {
  cards = Array.from(cards);
  if (!motionOn || !cards.length) return null;

  const pick = function (sel) {
    return cards.map(function (c) { return c.querySelector(sel); }).filter(Boolean);
  };
  const details = cards.flatMap(function (c) {
    return Array.from(c.querySelectorAll(".km-product-name, .km-product-specs li, .km-product-btn"));
  });

  return gsap
    .timeline({ delay: delay || 0 })
    .fromTo(
      cards,
      { autoAlpha: 0, y: 90, rotateX: -24, scale: 0.92, transformPerspective: 1100, transformOrigin: "50% 100%" },
      { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 1.1, stagger: 0.1, ease: "power4.out", clearProps: "transform,opacity,visibility" }
    )
    .fromTo(
      pick(".km-product-media img"),
      { clipPath: "inset(100% 0% 0% 0%)", scale: 1.35 },
      { clipPath: "inset(0% 0% 0% 0%)", scale: 1, duration: 1.3, stagger: 0.1, ease: "expo.out", clearProps: "clipPath,transform" },
      0.15
    )
    .fromTo(
      pick(".km-product-cart"),
      { scale: 0, rotate: -120 },
      { scale: 1, rotate: 0, duration: 0.7, stagger: 0.1, ease: "back.out(2.6)", clearProps: "transform" },
      0.5
    )
    .fromTo(
      details,
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.025, clearProps: "transform,opacity,visibility" },
      0.4
    )
    .fromTo(
      pick(".km-btn-icon"),
      { scale: 0, rotate: 180 },
      { scale: 1, rotate: 0, duration: 0.6, stagger: 0.1, ease: "back.out(2.4)", clearProps: "transform" },
      0.75
    );
}

initProductsCatalog();

// ===== Animated counters =====
// counting itself is played by the stats scene, in step with each card's entrance
function formatCount(n) {
  return Math.round(n).toLocaleString("en-US");
}

// reserve the final number's width so the digits don't push the "+" around while counting
function lockCounterWidth(el) {
  el.textContent = formatCount(+el.dataset.count);
  el.style.minWidth = el.offsetWidth / parseFloat(getComputedStyle(el).fontSize) + "em";
  el.textContent = "0";
}

function countUp(el) {
  const obj = { n: 0 };
  let shown = "0";
  return gsap.to(obj, {
    n: +el.dataset.count,
    duration: 2,
    ease: "power1.out",
    onUpdate: function () {
      const text = formatCount(obj.n);
      if (text === shown) return;
      shown = text;
      el.textContent = text;
    },
  });
}

if (!motionOn) {
  document.querySelectorAll(".km-counter").forEach(function (el) { el.textContent = formatCount(+el.dataset.count); });
}

// ===== Section scenes =====
// Each scene hides its parts up front and plays one choreographed timeline the first time it scrolls into view.
const SHOW = { autoAlpha: 1, x: 0, y: 0, xPercent: 0, yPercent: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0, clearProps: "transform,opacity,visibility" };
const EYEBROW_LINES = ".km-eyebrow-line, .about-eyebrow-line, .services-km-eyebrow-line";
const EYEBROW_TEXTS = ".km-eyebrow-text, .about-eyebrow-text, .services-km-eyebrow-text";

function kmScene(el, prepare, play) {
  if (!motionOn || !el) return;
  const q = gsap.utils.selector(el);
  prepare(q, el);
  const scene = { el: el, play: function () { return play(q, el); } };
  kmScenes.push(scene);
  if (sceneObserver) observeScene(scene);
}

function finishScene(scene) {
  sceneObserver.unobserve(scene.el);
  unwatchPassed(scene.el);
  const tl = scene.play();
  if (tl) tl.progress(1);
}

function observeScene(scene) {
  sceneObserver.observe(scene.el);
  watchPassed(scene.el, function () { finishScene(scene); });
}

function initScenes() {
  sceneObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        const scene = kmScenes.find(function (s) { return s.el === entry.target; });
        if (!scene) return;
        if (entry.isIntersecting) {
          sceneObserver.unobserve(entry.target);
          unwatchPassed(entry.target);
          scene.play();
        } else if (entry.boundingClientRect.bottom < 0) {
          finishScene(scene);
        }
      });
    },
    { rootMargin: "0px 0px -15% 0px" }
  );
  kmScenes.forEach(observeScene);
}

// Wraps every word in a mask. Child elements (e.g. gradient text) become a single "word" and are
// transformed themselves, because background-clip:text breaks on transformed descendants.
function splitWords(el) {
  if (!el) return [];
  const inners = [];
  Array.from(el.childNodes).forEach(function (node) {
    if (node.nodeType === 3) {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (!part.trim()) return frag.appendChild(document.createTextNode(part));
        const mask = document.createElement("span");
        const inner = document.createElement("span");
        mask.className = "km-word";
        inner.className = "km-word-inner";
        inner.textContent = part;
        mask.appendChild(inner);
        frag.appendChild(mask);
        inners.push(inner);
      });
      node.replaceWith(frag);
    } else if (node.nodeType === 1) {
      const mask = document.createElement("span");
      mask.className = "km-word";
      node.replaceWith(mask);
      mask.appendChild(node);
      node.classList.add("km-word-inner");
      inners.push(node);
    }
  });
  return inners;
}

function prepWords(heading) {
  const words = splitWords(heading);
  gsap.set(words, { yPercent: 115, rotate: 7, transformOrigin: "50% 100%" });
  return words;
}

function playWords(tl, words, at) {
  return tl.to(words, { yPercent: 0, rotate: 0, duration: 1.15, stagger: 0.08, ease: "power4.out", clearProps: "transform" }, at);
}

function prepEyebrow(root) {
  root.querySelectorAll(EYEBROW_LINES).forEach(function (line) {
    const text = line.parentElement.querySelector(EYEBROW_TEXTS);
    const lineBox = line.getBoundingClientRect();
    const textBox = text ? text.getBoundingClientRect() : lineBox;
    gsap.set(line, { scaleX: 0, transformOrigin: lineBox.left < textBox.left ? "100% 50%" : "0% 50%" });
  });
  root.querySelectorAll(EYEBROW_TEXTS).forEach(function (text) {
    gsap.set(text, { autoAlpha: 0, y: 14, x: 30 * DIR });
  });
}

function playEyebrow(tl, root, at) {
  return tl
    .to(root.querySelectorAll(EYEBROW_LINES), { scaleX: 1, duration: 1.1, ease: "expo.inOut", clearProps: "transform" }, at)
    .to(root.querySelectorAll(EYEBROW_TEXTS), Object.assign({}, SHOW, {
      duration: 1.1,
    }), at + 0.15);
}

// line-by-line wipe for headings whose gradient sits on the line element itself
function prepLines(lines) {
  gsap.set(lines, { y: 60, clipPath: "inset(0% 0% 100% 0%)" });
}

function playLines(tl, lines, at) {
  return tl.to(lines, { y: 0, clipPath: "inset(0% 0% -30% 0%)", duration: 1.2, stagger: 0.14, ease: "power4.out", clearProps: "transform,clipPath" }, at);
}

function initSectionScenes() {
  // ----- About -----
  kmScene(
    document.querySelector(".about-content"),
    function (q, el) {
      prepEyebrow(el);
      prepLines(q(".about-title > span"));
      gsap.set(q(".about-desc"), { autoAlpha: 0, y: 40 });
      gsap.set(q(".about-action"), { autoAlpha: 0, x: 40 * DIR });
      gsap.set(q(".km-btn-icon"), { scale: 0, rotate: -180 });
    },
    function (q, el) {
      const tl = gsap.timeline();
      playEyebrow(tl, el, 0);
      playLines(tl, q(".about-title > span"), 0.2);
      return tl
        .to(q(".about-desc"), Object.assign({ duration: 1 }, SHOW), 0.55)
        .to(q(".about-action"), Object.assign({ duration: 0.9 }, SHOW), 0.75)
        .to(q(".km-btn-icon"), { scale: 1, rotate: 0, duration: 0.8, ease: "back.out(2.4)", clearProps: "transform" }, 0.95);
    }
  );

  // ----- Services header -----
  kmScene(
    document.querySelector(".services-km-head"),
    function (q, el) {
      prepEyebrow(el);
      prepLines(q(".services-km-title > span"));
      gsap.set(q(".services-km-desc"), { autoAlpha: 0, y: 30 });
    },
    function (q, el) {
      const tl = gsap.timeline();
      playEyebrow(tl, el, 0);
      playLines(tl, q(".services-km-title > span"), 0.2);
      return tl.to(q(".services-km-desc"), Object.assign({ duration: 1 }, SHOW), 0.5);
    }
  );

  // ----- Products banner -----
  kmScene(
    document.querySelector(".km-products-banner"),
    function (q, el) {
      el._words = prepWords(q(".km-products-title")[0]);
      prepEyebrow(el);
      gsap.set(q(".km-products-banner-img"), { autoAlpha: 0, scale: 1.25, xPercent: -8 * DIR });
      gsap.set(q(".km-products-banner-lines"), { clipPath: "inset(0% 0% 100% 0%)" });
      gsap.set(q(".km-products-intro p, .km-products-intro .km-btn"), { autoAlpha: 0, y: 30 });
      gsap.set(q(".km-products-intro .km-btn-icon"), { scale: 0, rotate: -180 });
    },
    function (q, el) {
      const tl = gsap.timeline()
        .to(q(".km-products-banner-img"), Object.assign({ duration: 2, ease: "expo.out" }, SHOW), 0)
        .to(q(".km-products-banner-lines"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.6, ease: "expo.inOut", clearProps: "clipPath" }, 0.2);
      playEyebrow(tl, el, 0.2);
      playWords(tl, el._words, 0.35);
      return tl
        .to(q(".km-products-intro p"), Object.assign({ duration: 1 }, SHOW), 0.7)
        .to(q(".km-products-intro .km-btn"), Object.assign({ duration: 0.9 }, SHOW), 0.85)
        .to(q(".km-products-intro .km-btn-icon"), { scale: 1, rotate: 0, duration: 0.8, ease: "back.out(2.4)", clearProps: "transform" }, 1.05);
    }
  );

  // ----- Products tabs -----
  kmScene(
    document.querySelector(".km-products-tabs"),
    function (q, el) {
      gsap.set(el, { autoAlpha: 0, y: 60, scale: 0.95 });
      gsap.set(q(".km-tab-text"), { autoAlpha: 0, y: 16 });
      gsap.set(q(".km-tab-icon"), { scale: 0, rotate: -200 });
    },
    function (q, el) {
      return gsap.timeline()
        .to(el, Object.assign({ duration: 1.1, ease: "power4.out" }, SHOW), 0)
        .to(q(".km-tab-icon"), { scale: 1, rotate: 0, duration: 0.9, stagger: 0.1, ease: "back.out(2)", clearProps: "transform" }, 0.35)
        .to(q(".km-tab-text"), Object.assign({ duration: 0.7, stagger: 0.1 }, SHOW), 0.45);
    }
  );

  // ----- Products toolbar + cards -----
  kmScene(
    document.querySelector(".km-products-toolbar"),
    function (q) {
      gsap.set(q(".km-products-heading"), { autoAlpha: 0, x: 50 * DIR });
      gsap.set(q(".km-products-tools > *"), { autoAlpha: 0, y: 24, scale: 0.9 });
      gsap.set(".km-products-panes .active .km-product-card, .km-products-nav", { autoAlpha: 0 });
    },
    function (q) {
      const tl = gsap.timeline()
        .to(q(".km-products-heading"), Object.assign({ duration: 1 }, SHOW), 0)
        .to(q(".km-products-tools > *"), Object.assign({ duration: 0.8, stagger: 0.08, ease: "back.out(1.6)" }, SHOW), 0.1);
      const cards = animateProductCards(document.querySelectorAll(".km-products-panes .active .km-product-card"));
      if (cards) tl.add(cards, 0.25);
      return tl.fromTo(".km-products-nav", { autoAlpha: 0, y: 20 }, Object.assign({ duration: 0.8 }, SHOW), 0.9);
    }
  );

  // ----- Pump Selector -----
  kmScene(
    document.querySelector(".km-selector"),
    function (q, el) {
      el._words = prepWords(q(".km-selector-title")[0]);
      prepEyebrow(el);
      gsap.set(q(".km-selector-bg-img"), { scale: 1.18, xPercent: -4 * DIR });
      gsap.set(q(".km-selector-desc"), { autoAlpha: 0, y: 30 });
      gsap.set(q(".km-selector-card"), { autoAlpha: 0, x: -90 * DIR, rotateY: 18 * DIR, transformPerspective: 1400 });
      gsap.set(q(".km-selector-card-title, .km-selector-field, .km-selector-submit, .km-selector-note"), { autoAlpha: 0, y: 26 });
    },
    function (q, el) {
      const tl = gsap.timeline().to(q(".km-selector-bg-img"), { scale: 1, xPercent: 0, duration: 2.6, ease: "power2.out", clearProps: "transform" }, 0);
      playEyebrow(tl, el, 0.1);
      playWords(tl, el._words, 0.25);
      return tl
        .to(q(".km-selector-desc"), Object.assign({ duration: 1 }, SHOW), 0.55)
        .to(q(".km-selector-card"), Object.assign({ duration: 1.3, ease: "power4.out" }, SHOW), 0.3)
        .to(q(".km-selector-card-title, .km-selector-field, .km-selector-submit, .km-selector-note"), Object.assign({
          duration: 0.7,
          stagger: 0.08,
          onComplete: function () { q(".km-selector-submit")[0].classList.add("is-shine"); },
        }, SHOW), 0.7);
    }
  );

  kmScene(
    document.querySelector(".km-selector-features"),
    function (q) {
      gsap.set(q("li"), { autoAlpha: 0, y: 50, scale: 0.9 });
      gsap.set(q(".km-selector-feature-icon"), { scale: 0, rotate: -180 });
    },
    function (q) {
      return gsap.timeline()
        .to(q("li"), Object.assign({ duration: 1, stagger: 0.12, ease: "back.out(1.6)" }, SHOW), 0)
        .to(q(".km-selector-feature-icon"), { scale: 1, rotate: 0, duration: 0.8, stagger: 0.12, ease: "back.out(2.4)", clearProps: "transform" }, 0.2);
    }
  );

  // ----- Why Touch of Class -----
  // split in three scenes (head, features, stats) so the lower blocks play when they are actually reached
  const why = document.querySelector(".km-why");
  if (why) {
    kmScene(
      why.querySelector(".km-why .col-lg-6"),
      function (q, el) {
        el._words = prepWords(q(".km-why-title")[0]);
        prepEyebrow(el);
        gsap.set(q(".km-why-desc"), { autoAlpha: 0, y: 30, filter: "blur(6px)" });
      },
      function (q, el) {
        const tl = gsap.timeline();
        playEyebrow(tl, el, 0.1);
        playWords(tl, el._words, 0.25);
        return tl.to(q(".km-why-desc"), Object.assign({}, SHOW, { filter: "blur(0px)", duration: 1.1, clearProps: "transform,opacity,visibility,filter" }), 0.55);
      }
    );

    kmScene(
      why.querySelector(".km-why-features"),
      function (q) {
        gsap.set(q(".km-feature"), { autoAlpha: 0, x: 80 * DIR, rotateY: -30 * DIR, transformPerspective: 900, transformOrigin: DIR > 0 ? "100% 50%" : "0% 50%" });
        gsap.set(q(".km-feature-icon"), { scale: 0, rotate: -200 });
        gsap.set(q(".km-feature h3, .km-feature p"), { autoAlpha: 0, y: 18 });
      },
      function (q) {
        return gsap.timeline()
          .to(q(".km-feature"), Object.assign({ duration: 1.2, stagger: 0.14, ease: "power4.out" }, SHOW), 0)
          .to(q(".km-feature-icon"), { scale: 1, rotate: 0, duration: 0.9, stagger: 0.14, ease: "back.out(2.4)", clearProps: "transform" }, 0.25)
          .fromTo(
            q(".km-feature-icon"),
            { boxShadow: "0 0 0 0 rgba(237, 164, 31, 0.55)" },
            { boxShadow: "0 0 0 16px rgba(237, 164, 31, 0)", duration: 1.1, stagger: 0.14, ease: "power2.out", clearProps: "boxShadow" },
            0.55
          )
          .to(q(".km-feature h3, .km-feature p"), Object.assign({ duration: 0.7, stagger: 0.06 }, SHOW), 0.35);
      }
    );

    kmScene(
      why.querySelector(".km-stats"),
      function (q) {
        gsap.set(q(".km-stat"), { autoAlpha: 0, y: 70, rotateX: -70, scale: 0.9, transformPerspective: 1000, transformOrigin: "50% 100%" });
        gsap.set(q(".km-stat strong"), { scale: 0.5, autoAlpha: 0 });
        gsap.set(q(".km-stat p"), { autoAlpha: 0, y: 14 });
        q(".km-counter").forEach(lockCounterWidth);
      },
      function (q) {
        const tl = gsap.timeline()
          .to(q(".km-stat"), Object.assign({ duration: 1.3, stagger: 0.15, ease: "expo.out" }, SHOW), 0)
          .to(q(".km-stat strong"), Object.assign({ duration: 0.9, stagger: 0.15, ease: "back.out(2.2)" }, SHOW), 0.3)
          .to(q(".km-stat p"), Object.assign({
            duration: 0.7,
            stagger: 0.15,
            onComplete: function () {
              q(".km-stat").forEach(function (stat) { stat.classList.add("is-shine"); });
            },
          }, SHOW), 0.5);
        q(".km-counter").forEach(function (el, i) { tl.add(countUp(el), 0.35 + i * 0.15); });
        return tl;
      }
    );
  }

  // ----- Brands -----
  kmScene(
    document.querySelector(".km-brands"),
    function (q, el) {
      el._words = prepWords(q(".km-brands-title")[0]);
      prepEyebrow(el);
      gsap.set(q(".km-marquee"), { clipPath: "inset(0% 50% 0% 50%)" });
      gsap.set(q(".km-marquee-list li"), { autoAlpha: 0, y: 40 });
    },
    function (q, el) {
      const tl = gsap.timeline();
      playEyebrow(tl, el, 0);
      playWords(tl, el._words, 0.15);
      return tl
        .to(q(".km-marquee"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.4, ease: "expo.inOut", clearProps: "clipPath" }, 0.35)
        .to(q(".km-marquee-list li"), Object.assign({ duration: 0.8, stagger: 0.04 }, SHOW), 0.7);
    }
  );

  // ----- Articles -----
  kmScene(
    document.querySelector(".km-articles"),
    function (q, el) {
      el._words = prepWords(q(".km-articles-title")[0]);
      prepEyebrow(el);
      gsap.set(q(".km-articles-desc"), { autoAlpha: 0, y: 30 });
    },
    function (q, el) {
      const tl = gsap.timeline();
      playEyebrow(tl, el, 0);
      playWords(tl, el._words, 0.15);
      return tl.to(q(".km-articles-desc"), Object.assign({ duration: 1 }, SHOW), 0.45);
    }
  );

  kmScene(
    document.querySelector(".km-articles-grid"),
    function (q) {
      gsap.set(q(".km-article"), { autoAlpha: 0, y: 90, rotateX: 14, transformPerspective: 1200, transformOrigin: "50% 100%" });
      gsap.set(q(".km-article-media img, .km-article-bg"), { scale: 1.25 });
      gsap.set(q(".km-article-media"), { clipPath: "inset(100% 0% 0% 0%)" });
      gsap.set(q(".km-article-date, .km-article-title, .km-article-excerpt"), { autoAlpha: 0, y: 20 });
      gsap.set(q(".km-article-badge"), { autoAlpha: 0, scale: 0.6 });
      gsap.set(q(".km-article-more-icon"), { scale: 0, rotate: -180 });
    },
    function (q) {
      return gsap.timeline()
        .to(q(".km-article"), Object.assign({ duration: 1.2, stagger: 0.12, ease: "power4.out" }, SHOW), 0)
        .to(q(".km-article-media"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, stagger: 0.12, ease: "expo.inOut", clearProps: "clipPath" }, 0.1)
        .to(q(".km-article-media img, .km-article-bg"), { scale: 1, duration: 1.8, stagger: 0.12, ease: "power2.out", clearProps: "transform" }, 0.1)
        .to(q(".km-article-date, .km-article-title, .km-article-excerpt"), Object.assign({ duration: 0.7, stagger: 0.05 }, SHOW), 0.45)
        .to(q(".km-article-badge"), Object.assign({ duration: 0.6, ease: "back.out(2.4)" }, SHOW), 0.7)
        .to(q(".km-article-more-icon"), { scale: 1, rotate: 0, duration: 0.7, stagger: 0.1, ease: "back.out(2.4)", clearProps: "transform" }, 0.8);
    }
  );

  // ----- Contact -----
  kmScene(
    document.querySelector(".km-contact"),
    function (q, el) {
      el._words = prepWords(q(".km-contact-title")[0]);
      prepEyebrow(el);
      gsap.set(q(".km-contact-visual"), { autoAlpha: 0, x: 120 * DIR });
      gsap.set(q(".km-contact-visual img"), { scale: 1.2 });
      gsap.set(q(".km-contact-desc"), { autoAlpha: 0, y: 30 });
      gsap.set(q(".km-contact-item"), { autoAlpha: 0, x: -60 * DIR });
      gsap.set(q(".km-contact-icon"), { scale: 0, rotate: -160 });
      gsap.set(q(".km-contact-socials a"), { autoAlpha: 0, y: 24 });
    },
    function (q, el) {
      const tl = gsap.timeline()
        .to(q(".km-contact-visual"), Object.assign({ duration: 1.4, ease: "power4.out" }, SHOW), 0)
        .to(q(".km-contact-visual img"), { scale: 1, duration: 2.4, ease: "power2.out", clearProps: "transform" }, 0);
      playEyebrow(tl, el, 0.1);
      playWords(tl, el._words, 0.25);
      return tl
        .to(q(".km-contact-desc"), Object.assign({ duration: 1 }, SHOW), 0.55)
        .to(q(".km-contact-item"), Object.assign({ duration: 0.9, stagger: 0.1 }, SHOW), 0.65)
        .to(q(".km-contact-icon"), { scale: 1, rotate: 0, duration: 0.8, stagger: 0.1, ease: "back.out(2.4)", clearProps: "transform" }, 0.8)
        .to(q(".km-contact-socials a"), Object.assign({ duration: 0.6, stagger: 0.07, ease: "back.out(2)" }, SHOW), 1.15);
    }
  );

  kmScene(
    document.querySelector(".km-contact-card"),
    function (q, el) {
      gsap.set(el, { autoAlpha: 0, y: 110, rotateX: 16, transformPerspective: 1400, transformOrigin: "50% 100%" });
      gsap.set(q(".km-contact-card-title, .km-contact-card-desc, #contact-form > *"), { autoAlpha: 0, y: 26 });
    },
    function (q, el) {
      return gsap.timeline()
        .to(el, Object.assign({ duration: 1.3, ease: "power4.out" }, SHOW), 0)
        .to(q(".km-contact-card-title, .km-contact-card-desc, #contact-form > *"), Object.assign({
          duration: 0.7,
          stagger: 0.06,
          onComplete: function () { q(".km-contact-submit")[0].classList.add("is-shine"); },
        }, SHOW), 0.35);
    }
  );

  kmScene(
    document.querySelector(".km-contact-map"),
    function (q, el) {
      gsap.set(el, { autoAlpha: 0, y: 70, scale: 0.94, clipPath: "inset(0% 0% 100% 0% round 20px)" });
    },
    function (q, el) {
      return gsap.timeline().to(el, Object.assign({}, SHOW, { clipPath: "inset(0% 0% 0% 0% round 20px)", duration: 1.3, ease: "expo.out", clearProps: "transform,opacity,visibility,clipPath" }), 0);
    }
  );
}

initSectionScenes();

// Bootstrap's button plugin (data-bs-toggle="button") flips .active / aria-pressed first, on its document listener
document.addEventListener("click", function (e) {
  const cart = e.target.closest(".km-product-cart");
  if (!cart) return;
  const on = cart.classList.contains("active");
  cart.setAttribute("aria-label", on ? "إزالة من السلة" : "أضف للسلة");
  cart.querySelector("i").className = "fa-solid " + (on ? "fa-check" : "fa-cart-plus");
});

// ===== Shop page: grid / list view and instant sort =====
document.querySelectorAll('input[name="km-shop-view"]').forEach(function (input) {
  input.addEventListener("change", function () {
    const shop = input.closest(".km-shop");
    if (!input.checked || !shop) return;
    shop.classList.toggle("is-list", input.value === "list");
    animateProductCards(shop.querySelectorAll(".km-product-card"));
  });
});

document.querySelectorAll("select[data-autosubmit]").forEach(function (select) {
  select.addEventListener("change", function () {
    if (select.form) select.form.requestSubmit();
  });
});

// ===== Cart page: quantity, remove, totals =====
(function initCart() {
  const list = document.querySelector("[data-cart-list]");
  if (!list) return;

  const empty = document.querySelector("[data-cart-empty]");
  const submit = document.querySelector("[data-cart-submit]");

  function clamp(input) {
    const min = Number(input.min) || 1;
    const max = Number(input.max) || 99;
    const value = Math.min(max, Math.max(min, parseInt(input.value, 10) || min));
    input.value = value;
    const item = input.closest(".km-cart-item");
    item.querySelector('[data-qty="-1"]').disabled = value <= min;
    item.querySelector('[data-qty="1"]').disabled = value >= max;
  }

  function refresh() {
    const items = list.querySelectorAll(".km-cart-item");
    let units = 0;
    items.forEach(function (item) {
      units += parseInt(item.querySelector(".km-qty-input").value, 10) || 0;
    });
    document.querySelectorAll("[data-cart-count]").forEach(function (el) { el.textContent = items.length; });
    document.querySelectorAll("[data-cart-units]").forEach(function (el) { el.textContent = units; });
    list.hidden = !items.length;
    if (empty) empty.hidden = !!items.length;
    if (submit) submit.disabled = !items.length;
  }

  list.querySelectorAll(".km-qty-input").forEach(clamp);

  list.addEventListener("click", function (e) {
    const step = e.target.closest("[data-qty]");
    if (step) {
      const input = step.closest(".km-qty").querySelector(".km-qty-input");
      input.value = (parseInt(input.value, 10) || 0) + Number(step.dataset.qty);
      clamp(input);
      refresh();
      return;
    }

    const remove = e.target.closest("[data-cart-remove]");
    if (remove) {
      const item = remove.closest(".km-cart-item");
      item.classList.add("is-removing");
      setTimeout(function () {
        item.remove();
        refresh();
      }, 300);
    }
  });

  list.addEventListener("change", function (e) {
    if (!e.target.matches(".km-qty-input")) return;
    clamp(e.target);
    refresh();
  });

  refresh();
})();

// ===== Product details: gallery and quantity =====
document.querySelectorAll("[data-pd-thumb]").forEach(function (thumb) {
  thumb.addEventListener("click", function () {
    const main = document.querySelector("[data-pd-main]");
    if (!main || thumb.classList.contains("active")) return;
    document.querySelectorAll("[data-pd-thumb]").forEach(function (t) {
      t.classList.toggle("active", t === thumb);
      t.setAttribute("aria-pressed", t === thumb);
    });
    main.classList.add("is-swapping");
    setTimeout(function () {
      main.src = thumb.dataset.pdThumb;
      main.classList.remove("is-swapping");
    }, 250);
  });
});

document.querySelectorAll(".km-qty").forEach(function (qty) {
  if (qty.closest("[data-cart-list]")) return;
  const input = qty.querySelector(".km-qty-input");
  const minus = qty.querySelector('[data-qty="-1"]');
  const plus = qty.querySelector('[data-qty="1"]');

  function set(value) {
    const min = Number(input.min) || 1;
    const max = Number(input.max) || 99;
    input.value = Math.min(max, Math.max(min, value || min));
    minus.disabled = Number(input.value) <= min;
    plus.disabled = Number(input.value) >= max;
  }

  minus.addEventListener("click", function () { set(Number(input.value) - 1); });
  plus.addEventListener("click", function () { set(Number(input.value) + 1); });
  input.addEventListener("change", function () { set(parseInt(input.value, 10)); });
  set(parseInt(input.value, 10));
});

// ===== News details: copy post link =====
document.querySelectorAll("[data-copy-link]").forEach(function (btn) {
  btn.addEventListener("click", function () {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(window.location.href).then(function () {
      const icon = btn.querySelector("i");
      btn.classList.add("is-copied");
      icon.className = "fa-solid fa-check";
      setTimeout(function () {
        btn.classList.remove("is-copied");
        icon.className = "fa-solid fa-link";
      }, 2000);
    });
  });
});


// ==================================================
// Forms (Bootstrap validation only; valid forms submit to the server)
// ==================================================
document.querySelectorAll("form.needs-validation").forEach(function (form) {
  form.addEventListener("submit", function (e) {
    if (form.checkValidity()) return;

    e.preventDefault();
    form.classList.add("was-validated");
    const first = form.querySelector(":invalid");
    if (first) {
      first.focus();
      if (motionOn) gsap.fromTo(first.parentElement, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)", clearProps: "transform" });
    }
  });
});


