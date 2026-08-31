(function () {
  "use strict";

  var dialog = document.getElementById("bookingDialog");
  var bookingForm = document.getElementById("bookingForm");
  var bookingNext = document.getElementById("bookingNext");
  var bookingBack = document.getElementById("bookingBack");
  var bookingNav = document.getElementById("bookingNav");
  var bookingSuccess = document.getElementById("bookingSuccess");
  var bookingReference = document.getElementById("bookingReference");
  var successSummary = document.getElementById("successSummary");
  var stepCounter = document.getElementById("stepCounter");
  var mobileProgressBar = document.getElementById("mobileProgressBar");
  var bookingScreen = document.querySelector(".booking-screen");
  var dateInput = document.getElementById("bookingDate");
  var phoneInput = document.getElementById("passengerPhone");

  var state = {
    step: 1,
    trip: "",
    area: "",
    car: "",
    passengers: 1,
    bags: 1,
    completed: false
  };

  var localNow = new Date();
  var localDate = new Date(localNow.getTime() - localNow.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

  dateInput.min = localDate;
  document.getElementById("year").textContent = String(localNow.getFullYear());

  function setBodyLock(locked) {
    document.body.classList.toggle("dialog-open", locked);
  }

  function openDialog() {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    setBodyLock(true);
  }

  function closeDialog() {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
    setBodyLock(false);
  }

  function clearErrors() {
    bookingForm.querySelectorAll("[aria-invalid='true']").forEach(function (input) {
      input.removeAttribute("aria-invalid");
    });
    bookingForm.querySelectorAll(".field-error").forEach(function (error) {
      error.textContent = "";
    });
  }

  function normalizeDigits(value) {
    var arabicDigits = "٠١٢٣٤٥٦٧٨٩";
    var persianDigits = "۰۱۲۳۴۵۶۷۸۹";

    return value
      .replace(/[٠-٩]/g, function (digit) {
        return String(arabicDigits.indexOf(digit));
      })
      .replace(/[۰-۹]/g, function (digit) {
        return String(persianDigits.indexOf(digit));
      });
  }

  function setError(inputId, message) {
    var input = document.getElementById(inputId);
    var error = document.querySelector("[data-error-for='" + inputId + "']");
    input.setAttribute("aria-invalid", "true");
    error.textContent = message;
  }

  function selectedForStep(step) {
    if (step === 1) return Boolean(state.trip);
    if (step === 2) return Boolean(state.area);
    if (step === 3) return Boolean(state.car);
    return true;
  }

  function syncChoiceButtons() {
    document.querySelectorAll("[data-choice]").forEach(function (button) {
      var key = button.getAttribute("data-choice");
      var value = button.getAttribute("data-value");
      var selected = state[key] === value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function updateSummary() {
    document.getElementById("summaryTrip").textContent = state.trip || "—";
    document.getElementById("summaryArea").textContent = state.area || "—";
    document.getElementById("summaryCar").textContent = state.car || "—";
    document.getElementById("summaryCounts").textContent =
      String(state.passengers) + " / " + String(state.bags);
    document.getElementById("passengersCount").textContent = String(state.passengers);
    document.getElementById("bagsCount").textContent = String(state.bags);
  }

  function renderStep() {
    document.querySelectorAll(".booking-step").forEach(function (section) {
      var sectionStep = Number(section.getAttribute("data-step"));
      section.classList.toggle("is-active", !state.completed && sectionStep === state.step);
    });

    document.querySelectorAll("[data-progress-step]").forEach(function (item) {
      var progressStep = Number(item.getAttribute("data-progress-step"));
      item.classList.toggle("is-active", !state.completed && progressStep === state.step);
      item.classList.toggle(
        "is-complete",
        state.completed || progressStep < state.step
      );
      if (!state.completed && progressStep === state.step) {
        item.setAttribute("aria-current", "step");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    stepCounter.textContent = state.completed
      ? "اكتمل طلب المعاينة"
      : "الخطوة " + String(state.step) + " من 4";
    mobileProgressBar.style.width = state.completed
      ? "100%"
      : String(state.step * 25) + "%";

    bookingBack.hidden = state.step === 1 || state.completed;
    bookingNext.disabled = !selectedForStep(state.step);
    bookingNext.querySelector("span").textContent =
      state.step === 4 ? "تأكيد الحجز" : "التالي";
    bookingNav.hidden = state.completed;
    bookingSuccess.classList.toggle("is-active", state.completed);

    syncChoiceButtons();
    updateSummary();

    if (bookingScreen) {
      bookingScreen.scrollTop = 0;
    }
  }

  function setStep(nextStep) {
    state.step = Math.max(1, Math.min(4, nextStep));
    state.completed = false;
    clearErrors();
    renderStep();
  }

  function resetBooking() {
    state.step = 1;
    state.trip = "";
    state.area = "";
    state.car = "";
    state.passengers = 1;
    state.bags = 1;
    state.completed = false;
    bookingForm.reset();
    clearErrors();
    renderStep();
  }

  function openBooking(preselectedCar) {
    if (state.completed) {
      resetBooking();
    }
    state.step = 1;
    if (preselectedCar) {
      state.car = preselectedCar;
    }
    renderStep();
    openDialog();
  }

  function validateDetails() {
    clearErrors();

    var nameInput = document.getElementById("passengerName");
    var timeInput = document.getElementById("bookingTime");
    var name = nameInput.value.trim();
    var phone = normalizeDigits(phoneInput.value).replace(/\D/g, "");
    var valid = true;
    var firstInvalid = null;

    if (
      name.length < 3 ||
      !/[A-Za-z\u0600-\u06FF]{2}/.test(name) ||
      /^(test|تست)$/i.test(name)
    ) {
      setError("passengerName", "اكتب اسم المسافر الكامل.");
      firstInvalid = firstInvalid || nameInput;
      valid = false;
    }

    if (!/^07\d{9}$/.test(phone)) {
      setError("passengerPhone", "اكتب رقم عراقي صحيح يبدأ بـ 07.");
      firstInvalid = firstInvalid || phoneInput;
      valid = false;
    }

    if (!dateInput.value || dateInput.value < localDate) {
      setError("bookingDate", "حدد تاريخ الرحلة الصحيح.");
      firstInvalid = firstInvalid || dateInput;
      valid = false;
    }

    if (!timeInput.value) {
      setError("bookingTime", "حدد وقت وصول السيارة.");
      firstInvalid = firstInvalid || timeInput;
      valid = false;
    }

    if (firstInvalid) {
      firstInvalid.focus();
    }

    return valid;
  }

  function randomCode() {
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var values = new Uint8Array(4);

    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(values);
    } else {
      for (var index = 0; index < values.length; index += 1) {
        values[index] = Math.floor(Math.random() * 255);
      }
    }

    return Array.from(values)
      .map(function (value) {
        return alphabet[value % alphabet.length];
      })
      .join("");
  }

  function buildReference() {
    var compactDate = localDate.slice(2).replace(/-/g, "");
    return "TM-" + compactDate + "-" + randomCode();
  }

  function formatBookingDate() {
    var time = document.getElementById("bookingTime").value;
    var bookingDate = new Date(dateInput.value + "T" + time);

    try {
      return new Intl.DateTimeFormat("ar-IQ", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(bookingDate);
    } catch (error) {
      return dateInput.value + " — " + time;
    }
  }

  function completeBooking() {
    state.completed = true;
    bookingReference.textContent = buildReference();
    successSummary.textContent =
      state.trip +
      " • " +
      state.area +
      " • " +
      state.car +
      " • " +
      formatBookingDate() +
      " • " +
      String(state.passengers) +
      " مسافر • " +
      String(state.bags) +
      " حقيبة";
    renderStep();
  }

  document.querySelectorAll("[data-booking-open]").forEach(function (button) {
    button.addEventListener("click", function () {
      openBooking("");
    });
  });

  document.querySelectorAll("[data-select-car]").forEach(function (button) {
    button.addEventListener("click", function () {
      openBooking(button.getAttribute("data-select-car"));
    });
  });

  document.querySelectorAll("[data-booking-close]").forEach(function (button) {
    button.addEventListener("click", closeDialog);
  });

  dialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    closeDialog();
  });

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) {
      closeDialog();
    }
  });

  document.querySelectorAll("[data-choice]").forEach(function (button) {
    button.addEventListener("click", function () {
      var key = button.getAttribute("data-choice");
      state[key] = button.getAttribute("data-value");
      syncChoiceButtons();
      updateSummary();
      bookingNext.disabled = false;
    });
  });

  bookingNext.addEventListener("click", function () {
    if (state.step < 4) {
      if (selectedForStep(state.step)) {
        setStep(state.step + 1);
      }
      return;
    }

    if (validateDetails()) {
      completeBooking();
    }
  });

  bookingBack.addEventListener("click", function () {
    setStep(state.step - 1);
  });

  document.querySelector("[data-edit-booking]").addEventListener("click", function () {
    setStep(1);
  });

  document.querySelectorAll("[data-counter]").forEach(function (counter) {
    counter.addEventListener("click", function (event) {
      var button = event.target.closest("[data-counter-action]");
      if (!button) return;

      var key = counter.getAttribute("data-counter");
      var action = button.getAttribute("data-counter-action");
      var maximum = key === "passengers" ? 12 : 20;
      var nextValue = state[key] + (action === "plus" ? 1 : -1);
      state[key] = Math.max(key === "passengers" ? 1 : 0, Math.min(maximum, nextValue));
      updateSummary();
    });
  });

  phoneInput.addEventListener("input", function () {
    phoneInput.value = normalizeDigits(phoneInput.value)
      .replace(/\D/g, "")
      .slice(0, 11);
    phoneInput.removeAttribute("aria-invalid");
    document.querySelector("[data-error-for='passengerPhone']").textContent = "";
  });

  bookingForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (state.step === 4 && validateDetails()) {
      completeBooking();
    }
  });

  bookingForm.querySelectorAll("input").forEach(function (input) {
    input.addEventListener("input", function () {
      input.removeAttribute("aria-invalid");
      var error = document.querySelector("[data-error-for='" + input.id + "']");
      if (error) error.textContent = "";
    });
  });

  document.querySelector("[data-finish-booking]").addEventListener("click", function () {
    closeDialog();
    window.setTimeout(resetBooking, 220);
  });

  renderStep();
})();
