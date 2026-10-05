/* Runs before first paint (classic script in <head>): apply the saved theme so dark-mode users never see a light flash,
   and mark that scripts run (html.js: the custom audio controls replace the native player). */
document.documentElement.classList.add("js");
try { var t = localStorage.getItem("theme"); if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t); } catch (e) {}
