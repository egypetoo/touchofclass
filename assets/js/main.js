// ===== GSAP Animations + Lenis smooth scroll =====
// Only transform / opacity are animated (plus one clip-path reveal) so everything stays on the compositor.
// Scroll-driven entrances use IntersectionObserver: no per-frame scroll math for elements off screen.
const hasGSAP = typeof gsap !== "undefined";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionOn = hasGSAP && !reduceMotion;
// direction comes from CSS (html:lang), so read the computed value; +1 = enter from the reading-start side
const DIR = getComputedStyle(document.documentElement).direction === "rtl" ? 1 : -1;

if (typeof Swiper !== "undefined" && Swiper.extendDefaults && document.documentElement.lang === "ar") {
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
let heroSwiper = null;
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

  hero.querySelectorAll(".hero-crown-svg path").forEach(function (path) {
    const length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
  });

  gsap.set(hero.querySelectorAll(".hero-crown-svg circle"), { scale: 0, transformOrigin: "50% 50%" });
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
    .fromTo(q(".hero-slide-bg"), { scale: 1.12 }, { scale: 1, duration: 7, ease: "power1.out" }, 0)
    .fromTo(
      q(".hero-crown-svg path"),
      { strokeDashoffset: function (i, el) { return el.getTotalLength(); } },
      { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut", stagger: 0.15 },
      0.1
    )
    .fromTo(q(".hero-crown-svg circle"), { scale: 0 }, { scale: 1, duration: 0.5, ease: "back.out(3)", stagger: 0.06 }, 0.7)
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

  if (heroSwiper) {
    animateHeroSlide(heroSwiper.slides[heroSwiper.activeIndex]);
    heroSwiper.autoplay.start();
  }

  initScrollAnimations();
  initServiceCards();
  initScenes();
}

// ----- Service cards -----
// 3D rise on entrance, photo wipe, self-drawing gold lines, then copy and button; mouse-follow tilt + glare on hover.
function prepareServiceCards() {
  if (!motionOn) return;

  gsap.utils.toArray(".service-card").forEach(function (card) {
    const q = gsap.utils.selector(card);
    gsap.set(card, { autoAlpha: 0, y: 90, rotateX: -28, scale: 0.92, transformPerspective: 1100, transformOrigin: "50% 100%" });
    gsap.set(q(".service-card-media"), { clipPath: "inset(100% 0% 0% 0%)" });
    gsap.set(q(".service-card-img"), { scale: 1.45, transition: "none" });
    gsap.set(q(".service-card-facets .facet"), { xPercent: 40, autoAlpha: 0 });
    gsap.set(q(".service-card-facets polyline"), { attr: { pathLength: 1 }, strokeDasharray: 1, strokeDashoffset: 1 });
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
    .to(q(".service-card-facets .facet"), { xPercent: 0, autoAlpha: 1, duration: 0.9, stagger: 0.12, ease: "power3.out", clearProps: "all" }, 0.6)
    .to(q(".service-card-facets polyline"), { strokeDashoffset: 0, duration: 0.9, stagger: 0.15, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" }, 0.75)
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
    $(loading).delay(200).fadeOut(400, startAnimations);
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

// Active nav link for the current page
function setActiveLink() {
  // details pages keep their parent section active (product-details.html -> products.html)
  const page = (window.location.pathname.split("/").pop() || "index.html").replace(/-details\.html$/, "s.html");

  document.querySelectorAll(".header .nav-link, .header .header-cta").forEach(function (link) {
    const href = link.getAttribute("href").replace("./", "");
    link.classList.toggle("active", href === page);
  });
}

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
function initHeroSlider() {
  const hero = document.querySelector("section.hero");
  if (!hero || typeof Swiper === "undefined" || !hero.querySelector(".hero-slider")) return;

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

  heroSwiper = new Swiper(hero.querySelector(".hero-slider"), {
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

  dots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      heroSwiper.slideToLoop(Number(this.dataset.index));
    });
  });
}

initHeroSlider();

// ===== Hero Mobile Slider (Swiper) =====
function initHeroMobileSlider() {
  const slider = document.querySelector(".heroSwiperMobile");
  if (!slider || typeof Swiper === "undefined") return;

  new Swiper(slider, {
    effect: "fade",
    fadeEffect: { crossFade: true },
    loop: true,
    speed: 1000,
    autoplay: {
      delay: 5000,
      disableOnInteraction: false,
    },
    pagination: {
      el: slider.querySelector(".swiper-pagination"),
      clickable: true,
    },
  });
}

initHeroMobileSlider();

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

// Quote form attachment filename feedback
const quoteFileInput = document.getElementById("quote-file");
if (quoteFileInput) {
  quoteFileInput.addEventListener("change", function () {
    const file = this.files?.[0];
    const uploadLabel = this.closest(".quote-upload-box, .km-upload")?.querySelector(".upload-main");
    if (uploadLabel && file) {
      uploadLabel.textContent = file.name;
    }
  });
}

// ===== Products catalog (tabs + search + sort + slider) =====
const KM_PRODUCTS = {
  motors: {
    title: "المواتير",
    desc: "مواتير عالية الكفاءة لمختلف التطبيقات الصناعية.",
    items: [
      { name: "موتور كهربائي IE3", img: "motor-ie3", value: 7.5, specs: [["fa-bolt", "7.5 kW"], ["fa-gauge-high", "1450 RPM"], ["fa-gear", "3 فاز"]] },
      { name: "موتور كهربائي IE2", img: "motor-ie2", value: 11, specs: [["fa-bolt", "11 kW"], ["fa-gauge-high", "3000 RPM"], ["fa-gear", "3 فاز"]] },
      { name: "موتور كهربائي IE1", img: "motor-ie1", value: 5.5, specs: [["fa-bolt", "5.5 kW"], ["fa-gauge-high", "1450 RPM"], ["fa-gear", "3 فاز"]] },
      { name: "موتور ضد الانفجار", img: "motor-exproof", value: 15, specs: [["fa-bolt", "15 kW"], ["fa-gauge-high", "3000 RPM"], ["fa-gear", "3 فاز"]] },
      { name: "موتور IE3 بريميوم", img: "motor-ie2", value: 22, specs: [["fa-bolt", "22 kW"], ["fa-gauge-high", "1480 RPM"], ["fa-gear", "3 فاز"]] },
      { name: "موتور سنجل فاز", img: "motor-ie1", value: 2.2, specs: [["fa-bolt", "2.2 kW"], ["fa-gauge-high", "2850 RPM"], ["fa-gear", "1 فاز"]] },
    ],
  },
  pumps: {
    title: "المضخات",
    desc: "مضخات بأداء موثوق للمياه والري والتطبيقات الصناعية.",
    items: [
      { name: "مضخة طرد مركزي", img: "pump-centrifugal", value: 7.5, specs: [["fa-bolt", "7.5 kW"], ["fa-water", "60 m³/h"], ["fa-arrow-up", "45 m"]] },
      { name: "مضخة غاطسة", img: "pump-submersible", value: 5.5, specs: [["fa-bolt", "5.5 kW"], ["fa-water", "18 m³/h"], ["fa-arrow-up", "120 m"]] },
      { name: "مضخة رأسية متعددة المراحل", img: "pump-vertical", value: 11, specs: [["fa-bolt", "11 kW"], ["fa-water", "32 m³/h"], ["fa-arrow-up", "150 m"]] },
      { name: "مضخة ذاتية التحضير", img: "pump-selfpriming", value: 2.2, specs: [["fa-bolt", "2.2 kW"], ["fa-water", "25 m³/h"], ["fa-arrow-up", "30 m"]] },
      { name: "مضخة سحب طرفي", img: "pump-centrifugal", value: 15, specs: [["fa-bolt", "15 kW"], ["fa-water", "120 m³/h"], ["fa-arrow-up", "40 m"]] },
    ],
  },
  pipes: {
    title: "المواسير",
    desc: "مواسير بمقاسات وضغوط متعددة لشبكات المياه والري والصرف.",
    items: [
      { name: "ماسورة HDPE PE100", img: "pipe-hdpe", value: 110, specs: [["fa-circle-notch", "Ø 110 mm"], ["fa-gauge-high", "PN 16"], ["fa-ruler-horizontal", "12 m"]] },
      { name: "ماسورة uPVC ضغط", img: "pipe-pvc", value: 90, specs: [["fa-circle-notch", "Ø 90 mm"], ["fa-gauge-high", "PN 10"], ["fa-ruler-horizontal", "6 m"]] },
      { name: "ماسورة صلب مجلفن", img: "pipe-steel", value: 4, specs: [["fa-circle-notch", "Ø 4 in"], ["fa-gauge-high", "SCH 40"], ["fa-ruler-horizontal", "6 m"]] },
      { name: "ماسورة HDPE PE80", img: "pipe-hdpe", value: 63, specs: [["fa-circle-notch", "Ø 63 mm"], ["fa-gauge-high", "PN 10"], ["fa-ruler-horizontal", "100 m"]] },
    ],
  },
  cables: {
    title: "الكابلات",
    desc: "كابلات كهربائية معتمدة للقوى والمضخات الغاطسة.",
    items: [
      { name: "كابل قوى XLPE", img: "cable-power", value: 16, specs: [["fa-circle-notch", "4×16 mm²"], ["fa-bolt", "0.6/1 kV"], ["fa-shield-halved", "مسلح"]] },
      { name: "كابل مضخات غاطسة", img: "cable-submersible", value: 6, specs: [["fa-circle-notch", "3×6 mm²"], ["fa-bolt", "450/750 V"], ["fa-droplet", "ضد المياه"]] },
      { name: "بكرة كابل 4 قلب", img: "cable-drum", value: 25, specs: [["fa-circle-notch", "4×25 mm²"], ["fa-bolt", "0.6/1 kV"], ["fa-ruler-horizontal", "500 m"]] },
      { name: "كابل غاطس مبطط", img: "cable-submersible", value: 4, specs: [["fa-circle-notch", "3×4 mm²"], ["fa-bolt", "450/750 V"], ["fa-droplet", "ضد المياه"]] },
    ],
  },
};

function initProductsCatalog() {
  const section = document.querySelector(".km-products");
  if (!section) return;

  const wrapper = section.querySelector("#km-products-wrapper");
  const swiperEl = section.querySelector(".km-products-swiper");
  const empty = section.querySelector("#km-products-empty");
  const titleEl = section.querySelector("#km-cat-title");
  const descEl = section.querySelector("#km-cat-desc");
  const search = section.querySelector("#km-product-search");
  const sort = section.querySelector("#km-product-sort");
  const tabs = section.querySelectorAll(".km-tab");
  const viewButtons = section.querySelectorAll(".km-view-toggle button");
  const state = { cat: "motors", view: "grid" };
  let swiper = null;

  function cardHTML(item) {
    const specs = item.specs
      .map(function (s) { return '<li><i class="fa-solid ' + s[0] + '"></i><span>' + s[1] + "</span></li>"; })
      .join("");
    return (
      '<div class="swiper-slide"><article class="km-product-card">' +
      '<div class="km-product-media">' +
      '<img src="./assets/images/products/' + item.img + '.webp" alt="' + item.name + '" loading="lazy" decoding="async" width="720" height="540" />' +
      '<button type="button" class="km-product-fav" aria-label="أضف للمفضلة" aria-pressed="false"><i class="fa-regular fa-heart"></i></button>' +
      "</div>" +
      '<div class="km-product-body">' +
      '<h4 class="km-product-name">' + item.name + "</h4>" +
      '<ul class="km-product-specs">' + specs + "</ul>" +
      '<a href="./products.html" class="km-product-btn"><span>عرض التفاصيل</span><span class="km-product-btn-icon"><i class="fa-solid fa-arrow-left"></i></span></a>' +
      "</div></article></div>"
    );
  }

  function currentItems() {
    const term = search.value.trim().toLowerCase();
    const items = KM_PRODUCTS[state.cat].items.filter(function (item) {
      return !term || item.name.toLowerCase().includes(term);
    });
    if (sort.value === "name") items.sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (sort.value === "value-asc") items.sort(function (a, b) { return a.value - b.value; });
    if (sort.value === "value-desc") items.sort(function (a, b) { return b.value - a.value; });
    return items;
  }

  function buildSwiper() {
    if (swiper) {
      swiper.destroy(true, true);
      swiper = null;
    }
    if (state.view !== "grid" || typeof Swiper === "undefined") return;

    swiper = new Swiper(swiperEl, {
      slidesPerView: 1.15,
      spaceBetween: 16,
      speed: 700,
      grabCursor: true,
      watchOverflow: true,
      navigation: { prevEl: section.querySelector(".km-products-prev"), nextEl: section.querySelector(".km-products-next") },
      pagination: { el: section.querySelector(".km-products-dots"), clickable: true },
      breakpoints: {
        576: { slidesPerView: 2, spaceBetween: 18 },
        992: { slidesPerView: 3, spaceBetween: 20 },
        1200: { slidesPerView: 4, spaceBetween: 22 },
      },
    });
  }

  function render(animate) {
    const items = currentItems();
    const data = KM_PRODUCTS[state.cat];
    titleEl.textContent = data.title;
    descEl.textContent = data.desc;
    wrapper.innerHTML = items.map(cardHTML).join("");
    empty.hidden = items.length > 0;
    section.classList.toggle("is-list", state.view === "list");
    buildSwiper();

    if (animate) animateProductCards(wrapper.querySelectorAll(".km-product-card"));
  }

  // old cards fold away first, then the new set is built and flies in
  let switchTween = null;
  function switchTo(update) {
    update();
    if (!motionOn) return render(false);

    if (switchTween) switchTween.kill();
    const oldCards = wrapper.querySelectorAll(".km-product-card");
    gsap.to([titleEl, descEl], { autoAlpha: 0, y: -14, duration: 0.25, stagger: 0.04, ease: "power2.in", overwrite: true });

    switchTween = gsap.to(oldCards, {
      autoAlpha: 0,
      y: -40,
      rotateX: 22,
      scale: 0.94,
      transformPerspective: 1000,
      duration: 0.35,
      stagger: 0.04,
      ease: "power2.in",
      overwrite: true,
      onComplete: function () {
        render(true);
        gsap.fromTo([titleEl, descEl], { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08, clearProps: "all" });
      },
    });
    if (!oldCards.length) switchTween.progress(1);
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      if (tab.classList.contains("active")) return;
      tabs.forEach(function (t) {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      if (motionOn) {
        gsap.fromTo(
          tab.querySelector(".km-tab-icon"),
          { rotate: -200, scale: 0.4 },
          { rotate: 0, scale: 1, duration: 0.9, ease: "back.out(2.2)", clearProps: "transform" }
        );
      }
      switchTo(function () {
        state.cat = tab.dataset.cat;
        search.value = "";
      });
    });
  });

  viewButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.view === state.view) return;
      viewButtons.forEach(function (b) { b.classList.toggle("active", b === btn); });
      switchTo(function () {
        state.view = btn.dataset.view;
      });
    });
  });

  let searchTimer = null;
  search.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { render(true); }, 200);
  });
  sort.addEventListener("change", function () { switchTo(function () {}); });

  wrapper.addEventListener("click", function (e) {
    const fav = e.target.closest(".km-product-fav");
    if (!fav) return;
    const on = fav.classList.toggle("active");
    fav.setAttribute("aria-pressed", on ? "true" : "false");
    fav.querySelector("i").className = (on ? "fa-solid" : "fa-regular") + " fa-heart";
  });

  render(false);
}

function animateProductCards(cards, delay) {
  cards = Array.from(cards);
  if (!motionOn || !cards.length) return null;

  const pick = function (sel) {
    return cards.map(function (c) { return c.querySelector(sel); });
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
      pick(".km-product-fav"),
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
      pick(".km-product-btn-icon"),
      { scale: 0, rotate: 180 },
      { scale: 1, rotate: 0, duration: 0.6, stagger: 0.1, ease: "back.out(2.4)", clearProps: "transform" },
      0.75
    );
}

initProductsCatalog();

// ===== Animated counters =====
function initCounters() {
  const counters = document.querySelectorAll(".km-counter");
  if (!counters.length) return;

  const format = function (n) { return Math.round(n).toLocaleString("en-US"); };

  if (!motionOn) {
    counters.forEach(function (el) { el.textContent = format(+el.dataset.count); });
    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        unwatchPassed(entry.target);
        const el = entry.target;
        const obj = { n: 0 };
        gsap.to(obj, {
          n: +el.dataset.count,
          duration: 2.2,
          delay: 0.3,
          ease: "power2.out",
          onUpdate: function () { el.textContent = format(obj.n); },
        });
      });
    },
    { threshold: 0.6 }
  );

  counters.forEach(function (el) {
    observer.observe(el);
    watchPassed(el, function () {
      observer.unobserve(el);
      el.textContent = format(+el.dataset.count);
    });
  });
}

initCounters();

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
      gsap.set(q(".btn-about-circle"), { scale: 0, rotate: -180 });
    },
    function (q, el) {
      const tl = gsap.timeline();
      playEyebrow(tl, el, 0);
      playLines(tl, q(".about-title > span"), 0.2);
      return tl
        .to(q(".about-desc"), Object.assign({ duration: 1 }, SHOW), 0.55)
        .to(q(".about-action"), Object.assign({ duration: 0.9 }, SHOW), 0.75)
        .to(q(".btn-about-circle"), { scale: 1, rotate: 0, duration: 0.8, ease: "back.out(2.4)", clearProps: "transform" }, 0.95);
    }
  );

  // ----- Services header + crown -----
  kmScene(
    document.querySelector(".services-km-head"),
    function (q, el) {
      prepEyebrow(el);
      prepLines(q(".services-km-title > span"));
      gsap.set(q(".services-km-desc"), { autoAlpha: 0, y: 30 });
      document.querySelectorAll(".services-km-crown path, .services-km-crown line, .services-km-crown circle").forEach(function (shape) {
        const length = shape.getTotalLength();
        gsap.set(shape, { strokeDasharray: length, strokeDashoffset: length });
      });
    },
    function (q, el) {
      const tl = gsap.timeline();
      playEyebrow(tl, el, 0);
      playLines(tl, q(".services-km-title > span"), 0.2);
      return tl
        .to(q(".services-km-desc"), Object.assign({ duration: 1 }, SHOW), 0.5)
        .to(".services-km-crown path, .services-km-crown line, .services-km-crown circle", {
          strokeDashoffset: 0,
          duration: 2.2,
          stagger: 0.12,
          ease: "power2.inOut",
          clearProps: "strokeDasharray,strokeDashoffset",
        }, 0.1);
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
      gsap.set(q(".km-products-intro p"), { autoAlpha: 0, y: 30 });
    },
    function (q, el) {
      const tl = gsap.timeline()
        .to(q(".km-products-banner-img"), Object.assign({ duration: 2, ease: "expo.out" }, SHOW), 0)
        .to(q(".km-products-banner-lines"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.6, ease: "expo.inOut", clearProps: "clipPath" }, 0.2);
      playEyebrow(tl, el, 0.2);
      playWords(tl, el._words, 0.35);
      return tl.to(q(".km-products-intro p"), Object.assign({ duration: 1 }, SHOW), 0.7);
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
      gsap.set(".km-product-card, .km-products-nav", { autoAlpha: 0 });
    },
    function (q) {
      const tl = gsap.timeline()
        .to(q(".km-products-heading"), Object.assign({ duration: 1 }, SHOW), 0)
        .to(q(".km-products-tools > *"), Object.assign({ duration: 0.8, stagger: 0.08, ease: "back.out(1.6)" }, SHOW), 0.1);
      const cards = animateProductCards(document.querySelectorAll(".km-product-card"));
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
      gsap.set(q(".km-selector-features li"), { autoAlpha: 0, y: 50 });
      gsap.set(q(".km-selector-feature-icon"), { scale: 0, rotate: -180 });
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
        }, SHOW), 0.7)
        .to(q(".km-selector-features li"), Object.assign({ duration: 0.9, stagger: 0.12, ease: "power3.out" }, SHOW), 0.9)
        .to(q(".km-selector-feature-icon"), { scale: 1, rotate: 0, duration: 0.8, stagger: 0.12, ease: "back.out(2.4)", clearProps: "transform" }, 1.05);
    }
  );

  // ----- Why King Motors -----
  kmScene(
    document.querySelector(".km-why"),
    function (q, el) {
      el._words = prepWords(q(".km-why-title")[0]);
      prepEyebrow(el);
      gsap.set(q(".km-why-bg"), { scale: 1.2 });
      gsap.set(q(".km-why-desc"), { autoAlpha: 0, y: 30 });
      gsap.set(q(".km-feature"), { autoAlpha: 0, x: 70 * DIR, rotateY: -25 * DIR, transformPerspective: 900 });
      gsap.set(q(".km-feature-icon"), { scale: 0, rotate: -180 });
      gsap.set(q(".km-stat"), { autoAlpha: 0, rotateY: 90, transformPerspective: 1000 });
    },
    function (q, el) {
      const tl = gsap.timeline().to(q(".km-why-bg"), { scale: 1, duration: 2.6, ease: "power2.out", clearProps: "transform" }, 0);
      playEyebrow(tl, el, 0.1);
      playWords(tl, el._words, 0.25);
      return tl
        .to(q(".km-why-desc"), Object.assign({ duration: 1 }, SHOW), 0.55)
        .to(q(".km-feature"), Object.assign({ duration: 1.1, stagger: 0.12, ease: "power4.out" }, SHOW), 0.7)
        .to(q(".km-feature-icon"), { scale: 1, rotate: 0, duration: 0.8, stagger: 0.12, ease: "back.out(2.4)", clearProps: "transform" }, 0.95)
        .to(q(".km-stat"), Object.assign({
          duration: 1.2,
          stagger: 0.15,
          ease: "power3.out",
          onComplete: function () {
            q(".km-stat").forEach(function (stat) { stat.classList.add("is-shine"); });
          },
        }, SHOW), 0.5);
    }
  );

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

  // ----- Quote -----
  kmScene(
    document.querySelector(".km-quote"),
    function (q, el) {
      el._words = prepWords(q(".km-quote-title")[0]);
      prepEyebrow(el);
      gsap.set(q(".km-quote-desc"), { autoAlpha: 0, y: 30 });
      gsap.set(q(".km-quote-contact li"), { autoAlpha: 0, x: 60 * DIR });
      gsap.set(q(".km-quote-contact-icon"), { scale: 0, rotate: -160 });
      gsap.set(q(".km-quote-card"), { autoAlpha: 0, y: 110, rotateX: 16, transformPerspective: 1400, transformOrigin: "50% 100%" });
      gsap.set(q("#quote-form > *"), { autoAlpha: 0, y: 28 });
    },
    function (q, el) {
      const tl = gsap.timeline();
      playEyebrow(tl, el, 0);
      playWords(tl, el._words, 0.15);
      return tl
        .to(q(".km-quote-desc"), Object.assign({ duration: 1 }, SHOW), 0.45)
        .to(q(".km-quote-contact li"), Object.assign({ duration: 0.9, stagger: 0.12 }, SHOW), 0.6)
        .to(q(".km-quote-contact-icon"), { scale: 1, rotate: 0, duration: 0.8, stagger: 0.12, ease: "back.out(2.4)", clearProps: "transform" }, 0.75)
        .to(q(".km-quote-card"), Object.assign({ duration: 1.3, ease: "power4.out" }, SHOW), 0.2)
        .to(q("#quote-form > *"), Object.assign({
          duration: 0.7,
          stagger: 0.06,
          onComplete: function () { q(".km-quote-submit")[0].classList.add("is-shine"); },
        }, SHOW), 0.6);
    }
  );
}

initSectionScenes();

// ==================================================
// Pump Selector
// ==================================================
(function initPumpSelector() {
  const form = document.getElementById("pump-selector-form");
  if (!form) return;

  const fields = form.querySelectorAll('input[type="number"]');

  fields.forEach(function (input) {
    input.addEventListener("input", function () {
      input.classList.remove("is-invalid");
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const invalid = Array.from(fields).filter(function (input) {
      const value = parseFloat(input.value);
      const bad = !(value > 0);
      input.classList.toggle("is-invalid", bad);
      return bad;
    });

    if (invalid.length) {
      invalid[0].focus();
      gsap.fromTo(invalid[0].parentElement, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)", clearProps: "transform" });
      return;
    }

    const pumpsTab = document.querySelector('.km-tab[data-cat="pumps"]');
    if (pumpsTab && !pumpsTab.classList.contains("active")) pumpsTab.click();

    const target = document.getElementById("products");
    if (lenis) lenis.scrollTo(target, { offset: -80 });
    else target.scrollIntoView({ behavior: "smooth" });
  });
})();
