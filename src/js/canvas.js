/* Stellarium Web Engine - Copyright (c) 2022 - Stellarium Labs SRL
 *
 * This program is licensed under the terms of the GNU AGPL v3, or
 * alternatively under a commercial licence.
 *
 * The terms of the AGPL v3 license can be found in the main directory of this
 * repository.
 */

Module.afterInit(function() {
  if (!Module.canvas) return;

  // XXX: remove this I guess.
  var mouseDown = false;
  var mouseButtons = 0;
  var mousePos;

  // Function called at each frame
  var render = function(timestamp) {

    if (mouseDown)
      Module._core_on_mouse(0, 1, mousePos.x, mousePos.y, mouseButtons);

    // Check for canvas resize
    var canvas = Module.canvas;

    // Get the device pixel ratio, falling back to 1.
    var dpr = window.devicePixelRatio || 1;

    // Get the size of the canvas in CSS pixels.
    var rect = canvas.getBoundingClientRect();

    var displayWidth  = rect.width;
    var displayHeight = rect.height;
    var sizeChanged = (canvas.width  !== displayWidth) ||
                      (canvas.height !== displayHeight);

    if (sizeChanged) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
    }

    // TODO: manage paning and flicking here

    Module._core_update();
    Module._core_render(displayWidth, displayHeight, dpr);

    window.requestAnimationFrame(render)
  }

  var fixPageXY = function(e) {
    if (e.pageX == null && e.clientX != null ) {
      var html = document.documentElement
      var body = document.body
      e.pageX = e.clientX + (html.scrollLeft || body && body.scrollLeft || 0)
      e.pageX -= html.clientLeft || 0
      e.pageY = e.clientY + (html.scrollTop || body && body.scrollTop || 0)
      e.pageY -= html.clientTop || 0
    }
  };

  var setupMouse = function() {
    var canvas = Module.canvas;
    function getMousePos(evt) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
      };
    }

    canvas.addEventListener('mousedown', function(e) {
      var that = this;
      e = e || event;
      fixPageXY(e);
      mouseDown = true;
      mousePos = getMousePos(e);
      mouseButtons = e.buttons;

      document.onmouseup = function(e) {
        e = e || event;
        fixPageXY(e);
        mouseDown = false;
        mousePos = getMousePos(e);
        Module._core_on_mouse(0, 0, mousePos.x, mousePos.y, mouseButtons);
      };
      document.onmouseleave = function(e) {
        mouseDown = false;
      };

      document.onmousemove = function(e) {
        e = e || event;
        fixPageXY(e);
        mousePos = getMousePos(e);
      }
    });

    // Touch tracking for smooth mobile experience
    var touchState = {
      lastTouchTime: 0,
      touchCount: 0,
      lastScale: 1,
      pinchStartDist: 0,
      pinchCenter: {x: 0, y: 0}
    };

    // Get distance between two touch points
    function getTouchDistance(touch1, touch2) {
      var dx = touch1.pageX - touch2.pageX;
      var dy = touch1.pageY - touch2.pageY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Get center point between two touches
    function getTouchCenter(touch1, touch2, rect) {
      return {
        x: ((touch1.pageX + touch2.pageX) / 2) - rect.left,
        y: ((touch1.pageY + touch2.pageY) / 2) - rect.top
      };
    }

    canvas.addEventListener('touchstart', function(e) {
      var rect = canvas.getBoundingClientRect();
      touchState.touchCount = e.touches.length;
      touchState.lastTouchTime = performance.now();

      // Initialize pinch tracking when two fingers touch
      if (e.touches.length === 2) {
        touchState.pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);
        touchState.pinchCenter = getTouchCenter(e.touches[0], e.touches[1], rect);
        touchState.lastScale = 1;
      }

      for (var i = 0; i < e.changedTouches.length; i++) {
        var id = e.changedTouches[i].identifier;
        var relX = e.changedTouches[i].pageX - rect.left;
        var relY = e.changedTouches[i].pageY - rect.top;
        Module._core_on_mouse(id, 1, relX, relY, 1);
      }
    }, {passive: true});

    canvas.addEventListener('touchmove', function(e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      touchState.touchCount = e.touches.length;

      // Handle pinch zoom with smoother tracking
      if (e.touches.length === 2 && touchState.pinchStartDist > 0) {
        var currentDist = getTouchDistance(e.touches[0], e.touches[1]);
        var scale = currentDist / touchState.pinchStartDist;
        var center = getTouchCenter(e.touches[0], e.touches[1], rect);

        // Only apply significant scale changes to reduce jitter
        if (Math.abs(scale - touchState.lastScale) > 0.005) {
          var deltaScale = scale / touchState.lastScale;
          Module._core_on_zoom(deltaScale, center.x, center.y);
          touchState.lastScale = scale;
          touchState.pinchCenter = center;
        }
      }

      for (var i = 0; i < e.changedTouches.length; i++) {
        var id = e.changedTouches[i].identifier;
        var relX = e.changedTouches[i].pageX - rect.left;
        var relY = e.changedTouches[i].pageY - rect.top;
        Module._core_on_mouse(id, -1, relX, relY, 1);
      }
    }, {passive: false});

    canvas.addEventListener('touchend', function(e) {
      var rect = canvas.getBoundingClientRect();

      // Reset pinch state when fingers are lifted
      if (e.touches.length < 2) {
        touchState.pinchStartDist = 0;
        touchState.lastScale = 1;
      }
      touchState.touchCount = e.touches.length;

      for (var i = 0; i < e.changedTouches.length; i++) {
        var id = e.changedTouches[i].identifier;
        var relX = e.changedTouches[i].pageX - rect.left;
        var relY = e.changedTouches[i].pageY - rect.top;
        Module._core_on_mouse(id, 0, relX, relY, 1);
      }
    });

    // Handle touch cancel event for better mobile compatibility
    canvas.addEventListener('touchcancel', function(e) {
      var rect = canvas.getBoundingClientRect();
      touchState.pinchStartDist = 0;
      touchState.lastScale = 1;
      touchState.touchCount = 0;

      for (var i = 0; i < e.changedTouches.length; i++) {
        var id = e.changedTouches[i].identifier;
        var relX = e.changedTouches[i].pageX - rect.left;
        var relY = e.changedTouches[i].pageY - rect.top;
        Module._core_on_mouse(id, 0, relX, relY, 1);
      }
    });

    function getMouseWheelDelta(event) {
      var delta = 0;
      switch (event.type) {
        case 'DOMMouseScroll':
          delta = -event.detail;
          break;
        case 'mousewheel':
          delta = event.wheelDelta / 120;
          break;
        default:
          throw 'unrecognized mouse wheel event: ' + event.type;
      }
      return delta;
    }

    var onWheelEvent = function(e) {
      e.preventDefault();
      fixPageXY(e);
      var pos = getMousePos(e);
      var zoom_factor = 1.05;
      var delta = getMouseWheelDelta(e) * 2;
      Module._core_on_zoom(Math.pow(zoom_factor, delta), pos.x, pos.y);
      return false;
    };
    canvas.addEventListener('mousewheel', onWheelEvent, {passive: false});
    canvas.addEventListener('DOMMouseScroll', onWheelEvent, {passive: false});

    canvas.oncontextmenu = function(e) {
      e.preventDefault();
      e.stopPropagation();
    }

  };

  setupMouse();

  // Kickoff rendering at max FPS, normally 60 FPS on a browser.
  window.requestAnimationFrame(render)
})
