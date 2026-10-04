// ===== GSAP Animations + Lenis smooth scroll =====
// Only transform / opacity are animated (plus one clip-path reveal) so everything stays on the compositor.
// Scroll-driven entrances use IntersectionObserver: no per-frame scroll math for elements off screen.
const hasGSAP = typeof gsap !== "undefined";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const motionOn = hasGSAP && !reduceMotion;
let animationsStarted = false;
let heroSwiper = null;
let heroTimeline = null;
let lenis = null;

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
  left: { x: 60 },
  right: { x: -60 },
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

function revealImage(el) {
  gsap
    .timeline()
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
        } else if (entry.boundingClientRect.bottom < 0) {
          // already scrolled past (e.g. restored scroll position): show it without replaying
          observer.unobserve(entry.target);
          if (entry.target.dataset.anim === "reveal") {
            gsap.set(entry.target, { clearProps: "clipPath" });
            gsap.set(entry.target.querySelectorAll("img"), { clearProps: "transform,transition" });
          } else {
            gsap.set(entry.target, BLOCK_DONE);
          }
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
    .fromTo(q(".hero-brand-text"), { autoAlpha: 0, x: 24 }, Object.assign({ duration: 0.9 }, fadeIn), 0.3)
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
}

prepareAnimations();

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
    const uploadLabel = this.closest(".quote-upload-box")?.querySelector(".upload-main");
    if (uploadLabel && file) {
      uploadLabel.textContent = file.name;
    }
  });
}
