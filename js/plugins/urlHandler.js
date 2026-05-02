/**
 Copyright 2014 Gordon Williams (gw@pur3.co.uk)

 This Source Code is subject to the terms of the Mozilla Public
 License, v2.0. If a copy of the MPL was not distributed with this
 file, You can obtain one at http://mozilla.org/MPL/2.0/.

 ------------------------------------------------------------------
  Handle URLS of the form http://www.espruino.com/webide?...
  These are sent from background.js and are picked up by the Web IDE
 ------------------------------------------------------------------
**/
"use strict";
(function(){

  function init() {
    // Try and automatically handle the URL if we're served from somewhere we know
    if (typeof window!=="undefined" &&
        window.location &&
        (window.location.origin=="https://localhost" ||
         window.location.hostname=="localhost" ||
         window.location.hostname=="127.0.0.1" ||
         window.location.origin=="https://espruino.github.io" ||
         window.location.origin=="https://espruino.com" ||
         window.location.origin=="https://www.espruino.com")) {
      setTimeout(function() {
        handle(window.location.href);
      }, 200);
    }
  }

  function isTrustedAppLoaderOrigin(origin) {
    try {
      var url = new URL(origin);
      return ["https://banglejs.com","https://espruino.github.io"].includes(origin) ||
             ["localhost","127.0.0.1"].includes(url.hostname);
    } catch (e) {
      return false;
    }
  }

  function setupAppLoaderUpload(nonce) {
    if (!nonce || !new URLSearchParams(window.location.search).has("emulator")) return;
    var uploadStarted = false;
    // BangleApps opens WebIDE with ?apploader=<nonce>, then sends one
    // bangleapps.emulatorUpload message containing the generated install code.
    window.addEventListener("message", function(event) {
      var msg = event.data || {};
      if (msg.type!="bangleapps.emulatorUpload" || msg.nonce!=nonce) return;
      if (event.source!==window.opener || !isTrustedAppLoaderOrigin(event.origin)) {
        console.warn("Ignoring BangleApps emulator upload from "+event.origin);
        return;
      }
      if (uploadStarted) return;
      uploadStarted = true;
      event.source.postMessage({
        type:"bangleapps.emulatorUpload",
        nonce:nonce,
        status:"accepted"
      }, event.origin);
      Espruino.Core.MenuPortSelector.ensureConnected(function() {
        Espruino.Core.Terminal.focus();
        Espruino.callProcessor("sending");
        Espruino.Core.Utils.getEspruinoPrompt(function() {
          Espruino.Core.Serial.write(msg.code, true, function() {
            event.source.postMessage({
              type:"bangleapps.emulatorUpload",
              nonce:nonce,
              status:"done"
            }, event.origin);
          });
        });
      });
    });
  }

  function handleQuery(key, val) {
    var promise = Promise.resolve();
    switch(key){
      case "code": // Passing "encodedURIcomponent code" within the URL
        Espruino.Core.File.setJSCode(val);
        break;
      case "codeurl": // Passing a URL for code within the URL
        promise = promise.then(new Promise(function(resolve,reject) {
          Espruino.Core.File.setJSCode("// Loading from "+val+"...");
          Espruino.Core.Utils.getURL(val, function(data) {
            if (data!==undefined) {
              Espruino.Core.File.setJSCode(data);
              resolve();
            } else {
              Espruino.Core.File.setJSCode("// Error loading "+val);
              reject();
            }
          });
        }));
        break;
      case "gist": // Get code from a gist number in the URL
        promise = promise.then(new Promise(function(resolve,reject) {
          Espruino.Core.File.setJSCode("// Loading Gist "+val+"...");
          Espruino.Core.Utils.getJSONURL("https://api.github.com/gists/"+ val, function(data){
            if(data && data.files){
              var keys = Object.keys(data.files);
              if(keys.length > 0){
                Espruino.Core.File.setJSCode(data.files[keys[0]].content);
                resolve();
              } else reject();
            } else {
              Espruino.Core.File.setJSCode("// Error loading Gist "+val);
              reject();
            }
          });
        }));
        break;
      case "upload": // Get "encodedURIcomponent code" from URL and upload it
        promise = promise.then(new Promise(function(resolve,reject) {
          Espruino.Core.MenuPortSelector.ensureConnected(function() {
            Espruino.Core.Terminal.focus(); // give the terminal focus
            Espruino.callProcessor("sending");
            Espruino.Core.File.getEspruinoCode(function(code) {
              Espruino.Core.CodeWriter.writeToEspruino(code, function() {
                resolve();
              });
            });
          });
        }));
        break;
      case "apploader": // Receive a generated BangleApps install script from opener
        setupAppLoaderUpload(val);
        break;
      case "dev": // ?dev=BLE_devicename can restrict what we connect to
        Espruino.Config.WEB_SERIAL = false;
        Espruino.Config.WEB_BLUETOOTH_FILTER = val;
        break;
      case "settings":
        Espruino.Plugins.SettingsProfile.updateFromJson(val);
        break;
    }
  }

  function handle(url) {
    console.log("Handling URL "+JSON.stringify(url));
    url = (url);
    var h = url.indexOf("#");
    var q = url.indexOf("?");
    if (h>=0) {
      var hash = (q>h) ? url.substr(h+1,q) : url.substr(h+1);
      if (hash.substr(0,7)=="http://" ||
          hash.substr(0,8)=="https://") {
        handleQuery("codeurl",hash);
      }
    }
    if (q<0) return;
    var query = url.substr(q+1).split("&");
    for (var i in query) {
      var eq = query[i].split("=");
      if (eq.length==1)
        handleQuery(eq[0],undefined);
      else if (eq.length==2)
        handleQuery(decodeURIComponent(eq[0]),decodeURIComponent(eq[1]));
      else
        console.warn("Didn't understand query section "+JSON.stringify(query[i]));
    }
  }


  Espruino.Plugins.URLHandler = {
    init : init,

    handle : handle, // handle a URL
  };
}());
