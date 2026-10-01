/* GG CLAN — published snapshot reader.
   Hosted pages read JSON. A double-clicked index.html uses generated script
   copies of those same files because browsers block JSON fetch over file://.
   Both paths read only the saved snapshot; neither contacts a source API. */
window.GG_SNAPSHOT = (function () {
  "use strict";

  var files = new Map();
  var pending = new Map();

  function readLocal(url) {
    if (files.has(url)) return Promise.resolve(files.get(url));
    if (pending.has(url)) return pending.get(url);
    if (!/^data\/public\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.json$/.test(url)) {
      return Promise.reject(new Error("Invalid snapshot path"));
    }

    var request = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = url.replace(/\.json$/, ".js");
      function cleanUp() {
        pending.delete(url);
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      script.onload = function () {
        cleanUp();
        if (!files.has(url)) return reject(new Error("Stored snapshot file is invalid: " + url));
        resolve(files.get(url));
      };
      script.onerror = function () {
        cleanUp();
        reject(new Error("Stored snapshot file is unavailable: " + url));
      };
      document.head.appendChild(script);
    });
    pending.set(url, request);
    return request;
  }

  return {
    register: function (url, value) { files.set(url, value); },
    getJson: function (url) {
      if (window.location && window.location.protocol === "file:") return readLocal(url);
      return fetch(url, { cache: "no-cache" }).then(function (response) {
        if (!response.ok) throw new Error("Stored data request failed (" + response.status + ")");
        return response.json();
      });
    }
  };
})();
