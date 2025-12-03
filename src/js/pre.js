/* Stellarium Web Engine - Copyright (c) 2022 - Stellarium Labs SRL
 *
 * This program is licensed under the terms of the GNU AGPL v3, or
 * alternatively under a commercial licence.
 *
 * The terms of the AGPL v3 license can be found in the main directory of this
 * repository.
 */

// Allow to set the memory file path in 'memFile' argument.
Module['locateFile'] = function(path) {
  if (path === "stellarium-web-engine.wasm") return Module.wasmFile;
  return path;
}

Module['onRuntimeInitialized'] = function() {
  // Init OpenGL context.
  if (Module.canvasElement) Module.canvas = Module.canvasElement;
  if (Module.canvas) {
    var contextAttributes = {};
    contextAttributes.alpha = false;
    contextAttributes.depth = true;
    contextAttributes.stencil = true;
    contextAttributes.antialias = true;
    contextAttributes.premultipliedAlpha = true;
    contextAttributes.preserveDrawingBuffer = false;
    contextAttributes.preferLowPowerToHighPerformance = false;
    contextAttributes.failIfMajorPerformanceCaveat = false;
    contextAttributes.majorVersion = 1;
    contextAttributes.minorVersion = 0;
    var ctx = Module.GL.createContext(Module.canvas, contextAttributes);
    Module.GL.makeContextCurrent(ctx);
  }

  // Since we are going to redefine the setValue and getValue methods,
  // I put the old one in new attributes so that we can still use them.
  Module['_setValue'] = Module['setValue'];
  Module['_getValue'] = Module['getValue'];

  // Call all the functions registered with Module.afterInit(f)
  for (var i in Module.extendFns) { Module.extendFns[i]() }

  Module._core_init(0, 0, 1);
  Module.core = Module.getModule('core');
  Module.observer = Module.core.observer;

  // Setup the translation function provided by the client if any.
  if (Module.translateFn) {
    Module.translationsCache = {};
    let callback = Module.addFunction(function(user, domain, str) {
      domain = Module.UTF8ToString(domain);
      str = Module.UTF8ToString(str);
      str = Module.translateFn(domain, str);
      let value = Module.translationsCache[str];
      if (value) return value;
      let size = Module.lengthBytesUTF8(str) + 1;
      value = Module._malloc(size);
      Module.stringToUTF8(str, value, size);
      Module.translationsCache[str] = value;
      return value;
    }, 'iiii');
    Module._sys_set_translate_function(callback);
  }

  if (Module.onReady) Module.onReady(Module);
}

// All to register functions that will be called only after the runtime
// is initialized.
Module['extendFns'] = [];
Module['afterInit'] = function(f) {
  Module.extendFns.push(f);
}

// Add some methods to the module

Module['D2R'] = Math.PI / 180;
Module['R2D'] = 180 / Math.PI;

// Expose the frame enum.
// Make sure that correspond to the values in frames.h!
Module['FRAME_ASTROM'] = 0;
Module['FRAME_ICRF'] = 1;
Module['FRAME_CIRS'] = 2;
Module['FRAME_JNOW'] = 3;
Module['FRAME_OBSERVED_GEOM'] = 4;
Module['FRAME_OBSERVED'] = 5;
Module['FRAME_MOUNT'] = 6;
Module['FRAME_VIEW'] = 7;
Module['FRAME_ECLIPTIC'] = 8;

Module['MJD2date'] = function(v) {
  return new Date(Math.round((v + 2400000.5 - 2440587.5) * 86400000));
}

Module['date2MJD'] = function(date) {
  return date / 86400000 - 2400000.5 + 2440587.5;
}

/*
 * Function: a2tf
 * Decompose radians into hours, minutes, seconds, fraction.
 *
 * This is a direct wrapping of erfaA2tf.
 *
 * Parameters:
 *   angle      - Angle in radians.
 *   resolution - Number of decimal (see erfa doc for full explanation).
 *                default to 0 (no decimals).
 *
 * Return:
 *   an object with the following attributes:
 *     sign ('+' or '-')
 *     hours
 *     minutes
 *     seconds
 *     fraction
 */
Module['a2tf'] = function(angle, resolution) {
  resolution = resolution || 0;
  var a2tf_json = Module.cwrap('a2tf_json', 'number', ['number', 'number']);
  var cret = a2tf_json(resolution, angle);
  var ret = Module.UTF8ToString(cret);
  Module._free(cret);
  ret = JSON.parse(ret);
  return ret;
}

/*
 * Function: a2af
 * Decompose radians into degrees, arcminutes, arcseconds, fraction.
 *
 * This is a direct wrapping of erfaA2af.
 *
 * Parameters:
 *   angle      - Angle in radians.
 *   resolution - Number of decimal (see erfa doc for full explanation).
 *                default to 0 (no decimals).
 *
 * Return:
 *   an object with the following attributes:
 *     sign ('+' or '-')
 *     degrees
 *     arcminutes
 *     arcseconds
 *     fraction
 */
Module['a2af'] = function(angle, resolution) {
  resolution = resolution || 0;
  var a2af_json = Module.cwrap('a2af_json', 'number', ['number', 'number']);
  var cret = a2af_json(resolution, angle);
  var ret = Module.UTF8ToString(cret);
  Module._free(cret);
  ret = JSON.parse(ret);
  return ret;
}

/*
 * Function: calendar
 * Compute calendar events.
 *
 * Parameters:
 *   settings - Plain object with attributes:
 *     start    - start time (Date)
 *     end      - end time (Date)
 *     onEvent  - callback called for each calendar event, passed a plain
 *                object with attributes:
 *                  time  - time of the event (Date)
 *                  type  - type of event (string)
 *                  desc  - a small descrption (string)
 *                  o1    - first object of the event (or null)
 *                  o2    - second object of the event (or null)
 *     iterator - if set to true, then instead of computing all the events
 *                the function returns an itertor object that we have to
 *                call until it returns 0 in order to get all the events.
 *                eg:
 *
 *                var cal = stel.calendar({
 *                  start: new Date(2017, 1, 1),
 *                  end: new Date(2017, 1, 8),
 *                  onEvent: onEvent,
 *                  iterator: true
 *                });
 *                while (cal()) {}
 *
 *                This allows to split the computation into different frames
 *                of a loop so that we don't block too long.
 */
Module['calendar'] = function(args) {

  // Old signature: (start, end, callback)
  if (arguments.length == 3) {
    args = {
      start: arguments[0],
      end: arguments[1],
      onEvent: function(ev) {
        arguments[2](ev.time, ev.type, ev.desc, ev.flags, ev.o1, ev.o2);
      }
    };
  }

  var start = args.start / 86400000 + 2440587.5 - 2400000.5;
  var end = args.end / 86400000 + 2440587.5 - 2400000.5;

  var getCallback = function() {
    return Module.addFunction(
      function(time, type, desc, flags, o1, o2, user) {
        var ev = {
          time: Module.MJD2date(time),
          type: Module.UTF8ToString(type),
          desc: Module.UTF8ToString(desc),
          o1: o1 ? new Module.SweObj(o1) : null,
          o2: o2 ? new Module.SweObj(o2) : null
        };
        args.onEvent(ev);
      }, 'idiiiiii');
  }

  // Return an iterator function that the client needs to call as
  // long as it doesn't return 0.
  if (args.iterator) {
    var cal = Module._calendar_create(this.observer.v, start, end, 1);
    return function() {
      var ret = Module._calendar_compute(cal);
      if (!ret) {
        var callback = getCallback();
        Module._calendar_get_results_callback(cal, 0, callback);
        Module.removeFunction(callback);
        Module._calendar_delete(cal);
      }
      return ret;
    }
  }

  var callback = getCallback();
  Module._calendar_get(this.observer.v, start, end, 1, 0, callback);
  Module.removeFunction(callback);
}

/*
 * Function: designationCleanup
 * Create a printable version of a designation
 *
 * This can be used for example to compute the label to render for an object.
 *
 * Parameters:
 *   d     - the designation string.
 *   flags - formatting flags
 *
 * Return:
 *   A human-friendly designation.
 */
Module['designationCleanup'] = function(d, flags) {
  const designation_cleanup = Module.cwrap('designation_cleanup',
                                           null, ['string', 'number',
                                                  'number', 'number']);
  const cbuf = Module._malloc(256);
  designation_cleanup(d, cbuf, 256, flags);
  const ret = Module.UTF8ToString(cbuf);
  Module._free(out);
  return ret;
}

Module['c2s'] = function(v) {
  var x = v[0];
  var y = v[1];
  var z = v[2];
  var d2 = x * x + y * y;
  var theta = (d2 == 0.0) ? 0.0 : Math.atan2(y, x);
  var phi = (z === 0.0) ? 0.0 : Math.atan2(z, Math.sqrt(d2));
  return [theta, phi];
}

Module['s2c'] = function(theta, phi) {
  var cp = Math.cos(phi);
  return [Math.cos(theta) * cp, Math.sin(theta) * cp, Math.sin(phi)];
}

// Normalize angle into the range 0 <= a < 2pi.
Module['anp'] = function(a) {
  var v = a % (2 * Math.PI);
  if (v < 0) v += 2 * Math.PI;
  return v;
}

// Normalize angle into the range -pi <= a < +pi.
Module['anpm'] = function(a) {
  var v = a % (2 * Math.PI);
  if (Math.abs(v) >= Math.PI) v -= 2 * Math.PI * Math.sign(a);
  return v;
}

const asFrame = function(f) {
  if (f === 'ASTROM') return Module.FRAME_ASTROM;
  if (f === 'ICRF') return Module.FRAME_ICRF;
  if (f === 'CIRS') return Module.FRAME_CIRS;
  if (f === 'JNOW') return Module.FRAME_JNOW;
  if (f === 'OBSERVED') return Module.FRAME_OBSERVED;
  if (f === 'OBSERVED_GEOM') return Module.FRAME_OBSERVED_GEOM;
  if (f === 'MOUNT') return Module.FRAME_MOUNT;
  if (f === 'VIEW') return Module.FRAME_VIEW;
  assert(typeof(f) === 'number');
  return f;
}

/*
 * Function: convertFrame
 * Rotate the passed apparent coordinate vector from a Reference Frame to
 * another.
 *
 * Check the 4th component of the input vector
 * to know if the source is at infinity. If in[3] == 0.0, the source is at
 * infinity and the vector must be normalized, otherwise assume the vector to
 * contain the real object's distance in AU.
 *
 * The vector represents the apparent position/direction of the source as seen
 * by the observer in his reference system (usually GCRS for earth observation).
 * This means that effects such as space motion, light deflection or annual
 * aberration must already be taken into account before calling this function.
 *
 * Parameters:
 *   obs    - The observer.
 *   origin - Origin frame ('ASTROM', 'ICRF', 'CIRS', 'JNOW', 'OBSERVED',
 *            'OBSERVED_GEOM', 'VIEW').
 *   dest   - Destination frame (same as origin).
 *   v      - A 4d vector.
 *
 * Return:
 *   A 4d vector.
 */
Module['convertFrame'] = function(obs, origin, dest, v) {
  origin = asFrame(origin);
  dest = asFrame(dest);
  var v4 = [v[0], v[1], v[2], v[3] || 0.0];
  var ptr = Module._malloc(8 * 8);
  var i;
  for (i = 0; i < 4; i++)
    Module._setValue(ptr + i * 8, v4[i], 'double');
  Module._convert_framev4(obs.v, origin, dest, ptr, ptr + 4 * 8);
  var ret = new Array(4);
  for (i = 0; i < 4; i++)
    ret[i] = Module._getValue(ptr + (4 + i) * 8, 'double')
  Module._free(ptr);
  return ret;
}

/*
 * Function: lookAt
 * Move view direction to the given position.
 *
 * For example this can be used after core_get_point_for_mag to estimate the
 * angular size a circle should have to exactly fit the object.
 *
 * Parameters:
 *   pos      - The wanted pointing 3D direction in the OBSERVED frame.
 *   duration - Movement duration in sec.
 */
Module['lookAt'] = function(pos, duration) {
  if (duration === undefined)
    duration = 1.0;
  var v = Module._malloc(3 * 8);
  var i;
  for (i = 0; i < 3; i++)
    Module._setValue(v + i * 8, pos[i], 'double');
  Module._core_lookat(v, duration);
  Module._free(v);
}

/*
 * Function: pointAndLock
 * Move view direction to the given object and lock on it.
 *
 * Parameters:
 *   target   - The target object.
 *   duration - Movement duration in sec.
 */
Module['pointAndLock'] = function(target, duration) {
  if (duration === undefined)
    duration = 1.0;
  Module._core_point_and_lock(target.v, duration);
}

/*
 * Function: zoomTo
 * Change FOV to the passed value.
 *
 * Parameters:
 *   fov      - The target FOV diameter in rad.
 *   duration - Movement duration in sec.
 */
Module['zoomTo'] = function(fov, duration) {
  if (duration === undefined)
    duration = 1.0;
  Module._core_zoomto(fov, duration);
}

/*
 * Function: otypeToStr
 * Get the name for an object's otype.
 *
 * Parameters:
 *   otype    - The input 1-4 chars otype code.
 *
 * Return:
 *   The english name for an otype.
 */
Module['otypeToStr'] = function(otype) {
  var otype_to_str = Module.cwrap('otype_to_str', 'number', ['string']);
  var cret = otype_to_str(otype);
  return Module.UTF8ToString(cret);
}

let onClickCallback;
let onClickFn;
let onRectCallback;
let onRectFn;
/*
 * Function: on
 * Allow to listen to events on the sky map
 *
 * For the moment we only support the 'click' and 'rect' event.
 */
Module['on'] = function(eventName, callback) {
  if (eventName === 'click') {
    if (!onClickFn) {
      onClickFn = Module.addFunction(function(x, y) {
        return onClickCallback({point: {x: x, y: y}});
      }, 'idd');
    }
    onClickCallback = callback;
    Module.core.on_click = onClickFn;
  }
  if (eventName === 'rectSelection') {
    onRectFn = Module.addFunction(function(x1, y1, x2, y2) {
      return onRectCallback({rect: [{x: x1, y: y1}, {x: x2, y: y2}]});
    }, 'idddd');
    onRectCallback = callback;
    Module.core.on_rect = onRectFn;
  }
}


/*
 * Function: setFont
 * Load a font from a url and add it into the engine.
 *
 * If we add several fonts to the same face ('regular' or 'bold'), the
 * former are used as fallback.
 *
 * Parameters:
 *   font   - One of 'regular' or 'bold'
 *   url    - Url to a ttf font.
 *
 * Return:
 *   A promise that can be used to be notified once the font has been loaded.
 */
Module['setFont'] = function(font, url) {
  return fetch(url).then(function(response) {
    if (!response.ok) throw new Error(`Cannot get ${url}`);
    return response.arrayBuffer();
  }).then(function(data) {
    data = new Uint8Array(data);
    let ptr = Module._malloc(data.length);
    Module.writeArrayToMemory(data, ptr);
    Module.ccall('core_add_font', null,
                 ['number', 'string', 'string', 'number', 'number', 'number'],
                 [0, font, null, ptr, data.length]);

    // Also add the internal fallback font.
    let url = (font === 'regular') ? 'asset://font/NotoSans-Regular.ttf' :
                                     'asset://font/NotoSans-Bold.ttf';
    Module.ccall('core_add_font', null,
                 ['number', 'string', 'string', 'number', 'number', 'number'],
                 [0, font, url, 0, 0]);
  });
}

/*
 * Function: setChineseFont
 * Load a Chinese font and add it as a fallback font for CJK characters.
 *
 * This function should be called after setFont to add Chinese character support.
 * Recommended fonts: Noto Sans CJK SC, Source Han Sans, WenQuanYi Micro Hei
 *
 * Parameters:
 *   url    - Url to a ttf font that supports Chinese characters.
 *
 * Return:
 *   A promise that resolves when the font has been loaded.
 */
Module['setChineseFont'] = function(url) {
  return fetch(url).then(function(response) {
    if (!response.ok) throw new Error(`Cannot get Chinese font: ${url}`);
    return response.arrayBuffer();
  }).then(function(data) {
    data = new Uint8Array(data);
    let ptr = Module._malloc(data.length);
    Module.writeArrayToMemory(data, ptr);
    // Add as fallback for both regular and bold
    Module.ccall('core_add_font', null,
                 ['number', 'string', 'string', 'number', 'number', 'number'],
                 [0, 'regular', null, ptr, data.length]);
    Module.ccall('core_add_font', null,
                 ['number', 'string', 'string', 'number', 'number', 'number'],
                 [0, 'bold', null, ptr, data.length]);
  });
}

/*
 * Function: setPinchInertia
 * Configure the pinch zoom inertia behavior for mobile devices.
 *
 * Parameters:
 *   enabled  - Boolean, whether inertia is enabled (default: true)
 *   friction - Number between 0 and 1, friction coefficient (default: 0.92)
 *              Higher values = longer glide, lower values = quicker stop
 */
Module['setPinchInertia'] = function(enabled, friction) {
  if (enabled !== undefined) {
    Module.core.pinch_inertia_enabled = enabled;
  }
  if (friction !== undefined) {
    friction = Math.max(0, Math.min(1, friction)); // Clamp to [0, 1]
    Module.core.pinch_inertia_friction = friction;
  }
}

/*
 * Function: getPinchInertia
 * Get the current pinch zoom inertia settings.
 *
 * Return:
 *   An object with 'enabled' and 'friction' properties.
 */
Module['getPinchInertia'] = function() {
  return {
    enabled: Module.core.pinch_inertia_enabled,
    friction: Module.core.pinch_inertia_friction
  };
}

/*
 * Function: setPanInertia
 * Configure the pan/drag inertia behavior for mobile devices.
 *
 * Parameters:
 *   enabled  - Boolean, whether pan inertia is enabled (default: true)
 *   friction - Number between 0 and 1, friction coefficient (default: 0.95)
 *              Higher values = longer glide, lower values = quicker stop
 */
Module['setPanInertia'] = function(enabled, friction) {
  if (enabled !== undefined) {
    Module.core.pan_inertia_enabled = enabled;
  }
  if (friction !== undefined) {
    friction = Math.max(0, Math.min(1, friction));
    Module.core.pan_inertia_friction = friction;
  }
}

/*
 * Function: getPanInertia
 * Get the current pan inertia settings.
 *
 * Return:
 *   An object with 'enabled' and 'friction' properties.
 */
Module['getPanInertia'] = function() {
  return {
    enabled: Module.core.pan_inertia_enabled,
    friction: Module.core.pan_inertia_friction
  };
}

/*
 * Function: setTouchSensitivity
 * Configure touch sensitivity for mobile devices.
 *
 * Parameters:
 *   pan  - Pan sensitivity multiplier (default: 1.0)
 *   zoom - Zoom sensitivity multiplier (default: 1.0)
 */
Module['setTouchSensitivity'] = function(pan, zoom) {
  if (pan !== undefined) {
    Module.core.touch_pan_sensitivity = Math.max(0.1, Math.min(5, pan));
  }
  if (zoom !== undefined) {
    Module.core.touch_zoom_sensitivity = Math.max(0.1, Math.min(5, zoom));
  }
}

/*
 * Function: getTouchSensitivity
 * Get the current touch sensitivity settings.
 *
 * Return:
 *   An object with 'pan' and 'zoom' properties.
 */
Module['getTouchSensitivity'] = function() {
  return {
    pan: Module.core.touch_pan_sensitivity,
    zoom: Module.core.touch_zoom_sensitivity
  };
}

/*
 * Function: setRenderQuality
 * Configure rendering quality for performance optimization.
 * Lower quality can improve frame rate on mobile devices.
 *
 * Parameters:
 *   level       - Quality level: 0=low, 1=medium, 2=high (default: 2)
 *   labelDensity - Label density multiplier 0-1 (default: 1.0)
 */
Module['setRenderQuality'] = function(level, labelDensity) {
  if (level !== undefined) {
    Module.core.render_quality_level = Math.max(0, Math.min(2, Math.floor(level)));
  }
  if (labelDensity !== undefined) {
    Module.core.render_label_density = Math.max(0, Math.min(1, labelDensity));
  }
}

/*
 * Function: getRenderQuality
 * Get the current render quality settings.
 *
 * Return:
 *   An object with 'level' and 'labelDensity' properties.
 */
Module['getRenderQuality'] = function() {
  return {
    level: Module.core.render_quality_level,
    labelDensity: Module.core.render_label_density
  };
}

/*
 * Function: setMobileSettings
 * Convenience function to configure all mobile-related settings at once.
 *
 * Parameters:
 *   settings - Object with optional properties:
 *     pinchInertia: { enabled, friction }
 *     panInertia: { enabled, friction }
 *     touchSensitivity: { pan, zoom }
 *     renderQuality: { level, labelDensity }
 */
Module['setMobileSettings'] = function(settings) {
  if (settings.pinchInertia) {
    Module.setPinchInertia(settings.pinchInertia.enabled, 
                           settings.pinchInertia.friction);
  }
  if (settings.panInertia) {
    Module.setPanInertia(settings.panInertia.enabled,
                         settings.panInertia.friction);
  }
  if (settings.touchSensitivity) {
    Module.setTouchSensitivity(settings.touchSensitivity.pan,
                               settings.touchSensitivity.zoom);
  }
  if (settings.renderQuality) {
    Module.setRenderQuality(settings.renderQuality.level,
                            settings.renderQuality.labelDensity);
  }
}

/*
 * Function: getMobileSettings
 * Get all mobile-related settings at once.
 *
 * Return:
 *   An object with all mobile settings.
 */
Module['getMobileSettings'] = function() {
  return {
    pinchInertia: Module.getPinchInertia(),
    panInertia: Module.getPanInertia(),
    touchSensitivity: Module.getTouchSensitivity(),
    renderQuality: Module.getRenderQuality()
  };
}

/*
 * Function: enableMobileOptimizations
 * Enable mobile-optimized settings for better performance.
 * This is a convenience function that applies recommended mobile settings.
 *
 * Parameters:
 *   aggressive - Boolean, if true applies more aggressive optimizations
 */
Module['enableMobileOptimizations'] = function(aggressive) {
  if (aggressive) {
    Module.setMobileSettings({
      pinchInertia: { enabled: true, friction: 0.88 },
      panInertia: { enabled: true, friction: 0.90 },
      touchSensitivity: { pan: 1.2, zoom: 1.0 },
      renderQuality: { level: 1, labelDensity: 0.6 }
    });
  } else {
    Module.setMobileSettings({
      pinchInertia: { enabled: true, friction: 0.92 },
      panInertia: { enabled: true, friction: 0.95 },
      touchSensitivity: { pan: 1.0, zoom: 1.0 },
      renderQuality: { level: 2, labelDensity: 0.8 }
    });
  }
}

/*
 * Function: disableMobileOptimizations
 * Disable all mobile optimizations and use desktop defaults.
 */
Module['disableMobileOptimizations'] = function() {
  Module.setMobileSettings({
    pinchInertia: { enabled: false, friction: 0.92 },
    panInertia: { enabled: false, friction: 0.95 },
    touchSensitivity: { pan: 1.0, zoom: 1.0 },
    renderQuality: { level: 2, labelDensity: 1.0 }
  });
}

// ============================================================================
// Layer Management API
// ============================================================================

// Internal layer registry for tracking created layers
var g_layerRegistry = {};
var g_layerIdCounter = 0;

/*
 * Function: createImageLayer
 * Create a new image layer from a HiPS survey URL.
 *
 * Parameters:
 *   options - Object with:
 *     id      - Unique identifier for the layer (optional, auto-generated if not provided)
 *     url     - URL to the HiPS survey
 *     visible - Initial visibility (default: true)
 *     opacity - Initial opacity 0-1 (default: 1.0)
 *     z       - Z-order for rendering (default: 10)
 *
 * Return:
 *   The created layer object, or null on failure.
 */
Module['createImageLayer'] = function(options) {
  options = options || {};
  var id = options.id || ('image_layer_' + (++g_layerIdCounter));
  var visible = options.visible !== undefined ? options.visible : true;
  var z = options.z !== undefined ? options.z : 10;
  
  // Create a layer to hold the survey
  var layer = Module.createLayer({ id: id, visible: visible, z: z });
  if (!layer) return null;
  
  // Create an image survey object if URL is provided
  if (options.url) {
    var survey = Module.createObj('dss', {});
    if (survey) {
      survey.addDataSource({ url: options.url });
      layer.add(survey);
      
      // Store survey reference for later access
      layer._survey = survey;
    }
  }
  
  // Register the layer
  g_layerRegistry[id] = {
    layer: layer,
    type: 'image',
    url: options.url,
    opacity: options.opacity !== undefined ? options.opacity : 1.0
  };
  
  return layer;
}

/*
 * Function: createVectorLayer
 * Create a new vector layer for GeoJSON data.
 *
 * Parameters:
 *   options - Object with:
 *     id      - Unique identifier for the layer (optional)
 *     visible - Initial visibility (default: true)
 *     z       - Z-order for rendering (default: 20)
 *     data    - GeoJSON data object (optional, can be added later)
 *
 * Return:
 *   The created layer object.
 */
Module['createVectorLayer'] = function(options) {
  options = options || {};
  var id = options.id || ('vector_layer_' + (++g_layerIdCounter));
  var visible = options.visible !== undefined ? options.visible : true;
  var z = options.z !== undefined ? options.z : 20;
  
  var layer = Module.createLayer({ id: id, visible: visible, z: z });
  if (!layer) return null;
  
  // Add GeoJSON data if provided
  if (options.data) {
    var geojson = Module.createObj('geojson', options.data);
    if (geojson) {
      layer.add(geojson);
      layer._geojson = geojson;
    }
  }
  
  g_layerRegistry[id] = {
    layer: layer,
    type: 'vector',
    opacity: 1.0
  };
  
  return layer;
}

/*
 * Function: getLayer
 * Get a layer by its ID.
 *
 * Parameters:
 *   id - The layer ID
 *
 * Return:
 *   The layer object, or null if not found.
 */
Module['getLayer'] = function(id) {
  var entry = g_layerRegistry[id];
  return entry ? entry.layer : null;
}

/*
 * Function: getLayers
 * Get all registered layers.
 *
 * Return:
 *   An array of layer info objects with id, type, visible, and opacity.
 */
Module['getLayers'] = function() {
  var result = [];
  for (var id in g_layerRegistry) {
    var entry = g_layerRegistry[id];
    result.push({
      id: id,
      type: entry.type,
      visible: entry.layer.visible,
      opacity: entry.opacity,
      z: entry.layer.z
    });
  }
  // Sort by z-order
  result.sort(function(a, b) { return a.z - b.z; });
  return result;
}

/*
 * Function: removeLayer
 * Remove a layer by its ID.
 *
 * Parameters:
 *   id - The layer ID to remove
 *
 * Return:
 *   True if removed, false if not found.
 */
Module['removeLayer'] = function(id) {
  var entry = g_layerRegistry[id];
  if (!entry) return false;
  
  // Remove from core
  Module.core.remove(entry.layer);
  delete g_layerRegistry[id];
  return true;
}

/*
 * Function: setLayerVisible
 * Set the visibility of a layer.
 *
 * Parameters:
 *   id      - The layer ID
 *   visible - Boolean visibility
 */
Module['setLayerVisible'] = function(id, visible) {
  var entry = g_layerRegistry[id];
  if (entry) {
    entry.layer.visible = visible;
  }
}

/*
 * Function: setLayerOpacity
 * Set the opacity of a layer.
 *
 * Parameters:
 *   id      - The layer ID
 *   opacity - Opacity value 0-1
 */
Module['setLayerOpacity'] = function(id, opacity) {
  var entry = g_layerRegistry[id];
  if (entry) {
    entry.opacity = Math.max(0, Math.min(1, opacity));
    // Note: actual opacity rendering depends on the layer type implementation
  }
}

/*
 * Function: setLayerZ
 * Set the z-order of a layer (rendering order).
 *
 * Parameters:
 *   id - The layer ID
 *   z  - Z-order value (higher = rendered later/on top)
 */
Module['setLayerZ'] = function(id, z) {
  var entry = g_layerRegistry[id];
  if (entry) {
    entry.layer.z = z;
  }
}

/*
 * Function: bringLayerToFront
 * Bring a layer to the front (highest z-order).
 *
 * Parameters:
 *   id - The layer ID
 */
Module['bringLayerToFront'] = function(id) {
  var maxZ = 0;
  for (var lid in g_layerRegistry) {
    maxZ = Math.max(maxZ, g_layerRegistry[lid].layer.z || 0);
  }
  Module.setLayerZ(id, maxZ + 1);
}

/*
 * Function: sendLayerToBack
 * Send a layer to the back (lowest z-order).
 *
 * Parameters:
 *   id - The layer ID
 */
Module['sendLayerToBack'] = function(id) {
  var minZ = Infinity;
  for (var lid in g_layerRegistry) {
    minZ = Math.min(minZ, g_layerRegistry[lid].layer.z || 0);
  }
  Module.setLayerZ(id, minZ - 1);
}

/*
 * Function: setLayersOrder
 * Set the rendering order of multiple layers at once.
 *
 * Parameters:
 *   ids - Array of layer IDs in desired order (first = bottom, last = top)
 */
Module['setLayersOrder'] = function(ids) {
  for (var i = 0; i < ids.length; i++) {
    Module.setLayerZ(ids[i], i);
  }
}

/*
 * Function: showOnlyLayers
 * Show only the specified layers, hide all others.
 *
 * Parameters:
 *   ids - Array of layer IDs to show
 */
Module['showOnlyLayers'] = function(ids) {
  for (var lid in g_layerRegistry) {
    var show = ids.indexOf(lid) >= 0;
    Module.setLayerVisible(lid, show);
  }
}

/*
 * Function: showAllLayers
 * Show all registered layers.
 */
Module['showAllLayers'] = function() {
  for (var lid in g_layerRegistry) {
    Module.setLayerVisible(lid, true);
  }
}

/*
 * Function: hideAllLayers
 * Hide all registered layers.
 */
Module['hideAllLayers'] = function() {
  for (var lid in g_layerRegistry) {
    Module.setLayerVisible(lid, false);
  }
}

/*
 * Function: addHipsSurvey
 * Convenience function to add a HiPS image survey.
 *
 * Parameters:
 *   url     - URL to the HiPS survey
 *   options - Optional settings (id, visible, z)
 *
 * Return:
 *   The layer ID.
 */
Module['addHipsSurvey'] = function(url, options) {
  options = options || {};
  options.url = url;
  var layer = Module.createImageLayer(options);
  return layer ? (options.id || layer.id) : null;
}

/*
 * Function: addGeoJSONLayer
 * Convenience function to add a GeoJSON vector layer.
 *
 * Parameters:
 *   data    - GeoJSON data object or URL
 *   options - Optional settings (id, visible, z)
 *
 * Return:
 *   The layer ID.
 */
Module['addGeoJSONLayer'] = function(data, options) {
  options = options || {};
  
  // If data is a URL string, we need to fetch it
  if (typeof data === 'string') {
    var layerId = options.id || ('geojson_layer_' + (++g_layerIdCounter));
    options.id = layerId;
    
    // Create empty layer first
    var layer = Module.createVectorLayer(options);
    
    // Fetch and add data asynchronously
    fetch(data).then(function(response) {
      return response.json();
    }).then(function(json) {
      var geojson = Module.createObj('geojson', json);
      if (geojson && layer) {
        layer.add(geojson);
        layer._geojson = geojson;
      }
    });
    
    return layerId;
  } else {
    options.data = data;
    var layer = Module.createVectorLayer(options);
    return layer ? (options.id || layer.id) : null;
  }
}

/*
 * Function: toggleLayerBlending
 * Toggle additive blending for image layers (useful for multi-survey composites).
 *
 * Parameters:
 *   id       - The layer ID
 *   additive - Boolean, true for additive blending
 */
Module['toggleLayerBlending'] = function(id, additive) {
  var entry = g_layerRegistry[id];
  if (entry) {
    entry.additive = additive;
    // Note: actual blending mode depends on renderer implementation
  }
}

/*
 * Function: getBuiltinLayers
 * Get references to built-in layers (stars, constellations, planets, etc.)
 *
 * Return:
 *   Object with references to built-in layer modules.
 */
Module['getBuiltinLayers'] = function() {
  return {
    stars: Module.core.stars,
    constellations: Module.core.constellations,
    planets: Module.core.planets,
    dso: Module.core.dsos,
    dss: Module.core.dss,
    atmosphere: Module.core.atmosphere,
    landscape: Module.core.landscapes,
    milkyway: Module.core.milkyway,
    lines: Module.core.lines
  };
}

/*
 * Function: setBuiltinLayerVisible
 * Set visibility of a built-in layer.
 *
 * Parameters:
 *   name    - Layer name (stars, constellations, planets, etc.)
 *   visible - Boolean visibility
 */
Module['setBuiltinLayerVisible'] = function(name, visible) {
  var layers = Module.getBuiltinLayers();
  if (layers[name]) {
    layers[name].visible = visible;
  }
}

/*
 * Function: getBuiltinLayerVisible
 * Get visibility of a built-in layer.
 *
 * Parameters:
 *   name - Layer name
 *
 * Return:
 *   Boolean visibility.
 */
Module['getBuiltinLayerVisible'] = function(name) {
  var layers = Module.getBuiltinLayers();
  return layers[name] ? layers[name].visible : false;
}

// ============================================================================
// Time Control API
// ============================================================================

/*
 * Function: setTime
 * Set the simulation time with optional animation.
 *
 * Parameters:
 *   utc      - UTC time in MJD (Modified Julian Date)
 *   duration - Animation duration in seconds (0 for instant)
 */
Module['setTime'] = function(utc, duration) {
  duration = duration !== undefined ? duration : 0;
  Module._core_set_time(utc, duration);
}

/*
 * Function: getTime
 * Get the current simulation time.
 *
 * Return:
 *   Current UTC time in MJD.
 */
Module['getTime'] = function() {
  return Module.core.observer.utc;
}

/*
 * Function: setTimeSpeed
 * Set the time speed multiplier.
 *
 * Parameters:
 *   speed - Time multiplier (1 = real-time, 0 = paused, negative = reverse)
 */
Module['setTimeSpeed'] = function(speed) {
  Module.core.time_speed = speed;
}

/*
 * Function: getTimeSpeed
 * Get the current time speed multiplier.
 *
 * Return:
 *   Current time speed multiplier.
 */
Module['getTimeSpeed'] = function() {
  return Module.core.time_speed;
}

/*
 * Function: pauseTime
 * Pause the time simulation.
 */
Module['pauseTime'] = function() {
  Module.core.time_speed = 0;
}

/*
 * Function: resumeTime
 * Resume the time simulation at normal speed.
 */
Module['resumeTime'] = function() {
  Module.core.time_speed = 1;
}

/*
 * Function: setTimeToNow
 * Set the simulation time to current real time.
 *
 * Parameters:
 *   duration - Animation duration in seconds (0 for instant)
 */
Module['setTimeToNow'] = function(duration) {
  var now = Date.now() / 1000 / 86400 + 40587; // Convert to MJD
  Module.setTime(now, duration || 0);
}

/*
 * Function: dateToMjd
 * Convert a JavaScript Date to Modified Julian Date.
 *
 * Parameters:
 *   date - JavaScript Date object
 *
 * Return:
 *   MJD value.
 */
Module['dateToMjd'] = function(date) {
  return date.getTime() / 1000 / 86400 + 40587;
}

/*
 * Function: mjdToDate
 * Convert Modified Julian Date to JavaScript Date.
 *
 * Parameters:
 *   mjd - MJD value
 *
 * Return:
 *   JavaScript Date object.
 */
Module['mjdToDate'] = function(mjd) {
  return new Date((mjd - 40587) * 86400 * 1000);
}

// ============================================================================
// Observer Control API
// ============================================================================

/*
 * Function: setObserverLocation
 * Set the observer's geographic location.
 *
 * Parameters:
 *   lat       - Latitude in degrees (-90 to 90)
 *   lon       - Longitude in degrees (-180 to 180)
 *   elevation - Elevation in meters (optional, default 0)
 */
Module['setObserverLocation'] = function(lat, lon, elevation) {
  var obs = Module.core.observer;
  obs.latitude = lat * Math.PI / 180;
  obs.longitude = lon * Math.PI / 180;
  if (elevation !== undefined) {
    obs.elevation = elevation;
  }
}

/*
 * Function: getObserverLocation
 * Get the observer's geographic location.
 *
 * Return:
 *   Object with lat, lon, and elevation properties.
 */
Module['getObserverLocation'] = function() {
  var obs = Module.core.observer;
  return {
    lat: obs.latitude * 180 / Math.PI,
    lon: obs.longitude * 180 / Math.PI,
    elevation: obs.elevation
  };
}

/*
 * Function: setObserverDirection
 * Set the observer's viewing direction.
 *
 * Parameters:
 *   azimuth  - Azimuth in degrees (0 = North, 90 = East)
 *   altitude - Altitude in degrees (-90 to 90)
 */
Module['setObserverDirection'] = function(azimuth, altitude) {
  var obs = Module.core.observer;
  obs.yaw = azimuth * Math.PI / 180;
  obs.pitch = altitude * Math.PI / 180;
}

/*
 * Function: getObserverDirection
 * Get the observer's viewing direction.
 *
 * Return:
 *   Object with azimuth and altitude in degrees.
 */
Module['getObserverDirection'] = function() {
  var obs = Module.core.observer;
  return {
    azimuth: obs.yaw * 180 / Math.PI,
    altitude: obs.pitch * 180 / Math.PI
  };
}

/*
 * Function: setFov
 * Set the field of view.
 *
 * Parameters:
 *   fov      - FOV in degrees
 *   duration - Animation duration in seconds (optional)
 */
Module['setFov'] = function(fov, duration) {
  var fovRad = fov * Math.PI / 180;
  if (duration && duration > 0) {
    Module.zoomTo(fovRad, duration);
  } else {
    Module.core.fov = fovRad;
  }
}

/*
 * Function: getFov
 * Get the current field of view.
 *
 * Return:
 *   FOV in degrees.
 */
Module['getFov'] = function() {
  return Module.core.fov * 180 / Math.PI;
}

// ============================================================================
// Object Search and Info API
// ============================================================================

/*
 * Function: searchObject
 * Search for a celestial object by name or designation.
 *
 * Parameters:
 *   query - Search query string (e.g., "Sirius", "M31", "HIP 32349")
 *
 * Return:
 *   The found object, or null if not found.
 */
Module['searchObject'] = function(query) {
  var ptr = Module._core_search(Module.allocateUTF8(query));
  return ptr ? new Module.SweObj(ptr) : null;
}

/*
 * Function: getSelectedObject
 * Get the currently selected object.
 *
 * Return:
 *   The selected object, or null if nothing is selected.
 */
Module['getSelectedObject'] = function() {
  return Module.core.selection;
}

/*
 * Function: selectObject
 * Select an object.
 *
 * Parameters:
 *   obj - The object to select, or null to deselect
 */
Module['selectObject'] = function(obj) {
  Module.core.selection = obj;
}

/*
 * Function: lockOnObject
 * Lock the view on an object (auto-tracking).
 *
 * Parameters:
 *   obj      - The object to lock on, or null to unlock
 *   duration - Animation duration in seconds (optional)
 */
Module['lockOnObject'] = function(obj, duration) {
  if (obj) {
    Module.pointAndLock(obj, duration || 1.0);
  } else {
    Module.core.lock = null;
  }
}

/*
 * Function: getObjectInfo
 * Get information about a celestial object.
 *
 * Parameters:
 *   obj - The object
 *
 * Return:
 *   Object containing various properties like name, magnitude, distance, etc.
 */
Module['getObjectInfo'] = function(obj) {
  if (!obj) return null;
  
  var info = {
    type: obj.type,
    names: obj.designations ? obj.designations() : []
  };
  
  // Try to get common properties
  try { info.vmag = obj.vmag; } catch(e) {}
  try { info.distance = obj.distance; } catch(e) {}
  try { info.radec = obj.radec; } catch(e) {}
  try { info.azalt = obj.azalt; } catch(e) {}
  try { info.rise = obj.rise; } catch(e) {}
  try { info.set = obj.set; } catch(e) {}
  
  return info;
}

/*
 * Function: computeRiseSet
 * Compute rise and set times for an object.
 *
 * Parameters:
 *   obj       - The celestial object
 *   startTime - Start time in MJD (optional, defaults to now)
 *   days      - Number of days to search (optional, default 1)
 *
 * Return:
 *   Object with rise and set times in MJD, or null if always visible/invisible.
 */
Module['computeRiseSet'] = function(obj, startTime, days) {
  var obs = Module.core.observer;
  startTime = startTime !== undefined ? startTime : obs.utc;
  days = days !== undefined ? days : 1;
  
  var endTime = startTime + days;
  var precision = 1.0 / 86400; // 1 second precision
  
  var risePtr = Module._compute_event(obs.v, obj.v, 1, startTime, endTime, precision);
  var setPtr = Module._compute_event(obs.v, obj.v, 2, startTime, endTime, precision);
  
  var result = {};
  if (!isNaN(risePtr)) result.rise = risePtr;
  if (!isNaN(setPtr)) result.set = setPtr;
  
  return (result.rise !== undefined || result.set !== undefined) ? result : null;
}

// ============================================================================
// Projection and Rendering API
// ============================================================================

/*
 * Function: setProjection
 * Set the projection type.
 *
 * Parameters:
 *   projection - Projection type (0=perspective, 1=stereographic, 2=fisheye, etc.)
 */
Module['setProjection'] = function(projection) {
  Module.core.projection = projection;
}

/*
 * Function: getProjection
 * Get the current projection type.
 *
 * Return:
 *   Current projection type number.
 */
Module['getProjection'] = function() {
  return Module.core.projection;
}

// Projection type constants
Module['PROJ_PERSPECTIVE'] = 0;
Module['PROJ_STEREOGRAPHIC'] = 1;
Module['PROJ_FISHEYE'] = 2;
Module['PROJ_MERCATOR'] = 3;
Module['PROJ_HAMMER'] = 4;

/*
 * Function: setStarScale
 * Set the star rendering scale.
 *
 * Parameters:
 *   linearScale   - Linear scale factor (default: 0.8)
 *   relativeScale - Relative scale factor (default: 1.1)
 */
Module['setStarScale'] = function(linearScale, relativeScale) {
  if (linearScale !== undefined) {
    Module.core.star_linear_scale = linearScale;
  }
  if (relativeScale !== undefined) {
    Module.core.star_relative_scale = relativeScale;
  }
}

/*
 * Function: getStarScale
 * Get the current star rendering scale.
 *
 * Return:
 *   Object with linearScale and relativeScale properties.
 */
Module['getStarScale'] = function() {
  return {
    linearScale: Module.core.star_linear_scale,
    relativeScale: Module.core.star_relative_scale
  };
}

/*
 * Function: setBortleIndex
 * Set the Bortle scale index for light pollution simulation.
 *
 * Parameters:
 *   index - Bortle scale index (1-9, lower = darker sky)
 */
Module['setBortleIndex'] = function(index) {
  Module.core.bortle_index = Math.max(1, Math.min(9, index));
}

/*
 * Function: getBortleIndex
 * Get the current Bortle scale index.
 *
 * Return:
 *   Current Bortle index (1-9).
 */
Module['getBortleIndex'] = function() {
  return Module.core.bortle_index;
}

/*
 * Function: setMagnitudeLimit
 * Set the display magnitude limit.
 *
 * Parameters:
 *   mag - Maximum magnitude to display (higher = fainter objects visible)
 */
Module['setMagnitudeLimit'] = function(mag) {
  Module.core.display_limit_mag = mag;
}

/*
 * Function: getMagnitudeLimit
 * Get the current display magnitude limit.
 *
 * Return:
 *   Current magnitude limit.
 */
Module['getMagnitudeLimit'] = function() {
  return Module.core.display_limit_mag;
}

// ============================================================================
// Constellation Settings API
// ============================================================================

/*
 * Function: setConstellationSettings
 * Configure constellation display settings.
 *
 * Parameters:
 *   settings - Object with:
 *     lines: Boolean - Show constellation lines
 *     labels: Boolean - Show constellation labels
 *     images: Boolean - Show constellation images (artwork)
 *     bounds: Boolean - Show constellation boundaries
 */
Module['setConstellationSettings'] = function(settings) {
  var cons = Module.core.constellations;
  if (!cons) return;
  
  if (settings.lines !== undefined) cons.lines_visible = settings.lines;
  if (settings.labels !== undefined) cons.labels_visible = settings.labels;
  if (settings.images !== undefined) cons.images_visible = settings.images;
  if (settings.bounds !== undefined) cons.bounds_visible = settings.bounds;
}

/*
 * Function: getConstellationSettings
 * Get current constellation display settings.
 *
 * Return:
 *   Object with lines, labels, images, bounds properties.
 */
Module['getConstellationSettings'] = function() {
  var cons = Module.core.constellations;
  if (!cons) return null;
  
  return {
    lines: cons.lines_visible,
    labels: cons.labels_visible,
    images: cons.images_visible,
    bounds: cons.bounds_visible
  };
}

// ============================================================================
// Grid Lines API
// ============================================================================

/*
 * Function: setGridLines
 * Configure grid line visibility.
 *
 * Parameters:
 *   settings - Object with:
 *     azimuthal: Boolean - Azimuthal grid
 *     equatorial: Boolean - Equatorial grid (J2000)
 *     equatorialJnow: Boolean - Equatorial grid (of date)
 *     ecliptic: Boolean - Ecliptic line
 *     meridian: Boolean - Meridian line
 *     horizon: Boolean - Horizon line
 */
Module['setGridLines'] = function(settings) {
  var lines = Module.core.lines;
  if (!lines) return;
  
  if (settings.azimuthal !== undefined && lines.azimuthal) 
    lines.azimuthal.visible = settings.azimuthal;
  if (settings.equatorial !== undefined && lines.equatorial)
    lines.equatorial.visible = settings.equatorial;
  if (settings.equatorialJnow !== undefined && lines.equatorial_jnow)
    lines.equatorial_jnow.visible = settings.equatorialJnow;
  if (settings.ecliptic !== undefined && lines.ecliptic)
    lines.ecliptic.visible = settings.ecliptic;
  if (settings.meridian !== undefined && lines.meridian)
    lines.meridian.visible = settings.meridian;
}

/*
 * Function: getGridLines
 * Get current grid line visibility settings.
 *
 * Return:
 *   Object with grid line visibility properties.
 */
Module['getGridLines'] = function() {
  var lines = Module.core.lines;
  if (!lines) return null;
  
  return {
    azimuthal: lines.azimuthal ? lines.azimuthal.visible : false,
    equatorial: lines.equatorial ? lines.equatorial.visible : false,
    equatorialJnow: lines.equatorial_jnow ? lines.equatorial_jnow.visible : false,
    ecliptic: lines.ecliptic ? lines.ecliptic.visible : false,
    meridian: lines.meridian ? lines.meridian.visible : false
  };
}

// ============================================================================
// Sky Culture API
// ============================================================================

/*
 * Function: setSkyCulture
 * Set the sky culture (constellation system).
 *
 * Parameters:
 *   id - Sky culture identifier (e.g., 'western', 'chinese', 'arabic', etc.)
 */
Module['setSkyCulture'] = function(id) {
  var skycultures = Module.core.skycultures;
  if (skycultures) {
    skycultures.current = id;
  }
}

/*
 * Function: getSkyCulture
 * Get the current sky culture.
 *
 * Return:
 *   Current sky culture identifier.
 */
Module['getSkyCulture'] = function() {
  var skycultures = Module.core.skycultures;
  return skycultures ? skycultures.current : null;
}

/*
 * Function: getAvailableSkyCultures
 * Get list of available sky cultures.
 *
 * Return:
 *   Array of sky culture identifiers.
 */
Module['getAvailableSkyCultures'] = function() {
  // This would need to be implemented based on loaded data
  return ['western', 'chinese', 'egyptian', 'arabic', 'indian', 'korean', 'japanese'];
}

// ============================================================================
// Atmosphere and Environment API
// ============================================================================

/*
 * Function: setAtmosphere
 * Configure atmosphere settings.
 *
 * Parameters:
 *   enabled - Boolean, whether atmosphere is visible
 */
Module['setAtmosphere'] = function(enabled) {
  var atm = Module.core.atmosphere;
  if (atm) {
    atm.visible = enabled;
  }
}

/*
 * Function: getAtmosphere
 * Get atmosphere visibility.
 *
 * Return:
 *   Boolean indicating if atmosphere is visible.
 */
Module['getAtmosphere'] = function() {
  var atm = Module.core.atmosphere;
  return atm ? atm.visible : false;
}

/*
 * Function: setLandscape
 * Configure landscape (ground) visibility.
 *
 * Parameters:
 *   visible - Boolean, whether landscape is visible
 */
Module['setLandscape'] = function(visible) {
  var landscapes = Module.core.landscapes;
  if (landscapes) {
    landscapes.visible = visible;
  }
}

/*
 * Function: getLandscape
 * Get landscape visibility.
 *
 * Return:
 *   Boolean indicating if landscape is visible.
 */
Module['getLandscape'] = function() {
  var landscapes = Module.core.landscapes;
  return landscapes ? landscapes.visible : false;
}

/*
 * Function: setMilkyWay
 * Configure Milky Way visibility.
 *
 * Parameters:
 *   visible - Boolean, whether Milky Way is visible
 */
Module['setMilkyWay'] = function(visible) {
  var mw = Module.core.milkyway;
  if (mw) {
    mw.visible = visible;
  }
}

/*
 * Function: getMilkyWay
 * Get Milky Way visibility.
 *
 * Return:
 *   Boolean indicating if Milky Way is visible.
 */
Module['getMilkyWay'] = function() {
  var mw = Module.core.milkyway;
  return mw ? mw.visible : false;
}

// ============================================================================
// Screenshot and Export API
// ============================================================================

/*
 * Function: screenshot
 * Take a screenshot of the current view.
 *
 * Parameters:
 *   callback - Function called with the image data URL
 */
Module['screenshot'] = function(callback) {
  // Get the canvas
  var canvas = Module.canvas;
  if (canvas && callback) {
    callback(canvas.toDataURL('image/png'));
  }
}

/*
 * Function: getViewInfo
 * Get comprehensive information about the current view state.
 *
 * Return:
 *   Object containing all view parameters.
 */
Module['getViewInfo'] = function() {
  var obs = Module.core.observer;
  return {
    time: {
      utc: obs.utc,
      date: Module.mjdToDate(obs.utc),
      speed: Module.core.time_speed
    },
    location: Module.getObserverLocation(),
    direction: Module.getObserverDirection(),
    fov: Module.getFov(),
    projection: Module.getProjection(),
    selection: Module.core.selection ? Module.core.selection.id : null,
    lock: Module.core.lock ? Module.core.lock.id : null
  };
}

/*
 * Function: setViewFromInfo
 * Restore view state from a previously saved info object.
 *
 * Parameters:
 *   info     - View info object from getViewInfo()
 *   duration - Animation duration in seconds (optional)
 */
Module['setViewFromInfo'] = function(info, duration) {
  duration = duration || 0;
  
  if (info.time && info.time.utc !== undefined) {
    Module.setTime(info.time.utc, duration);
  }
  if (info.time && info.time.speed !== undefined) {
    Module.setTimeSpeed(info.time.speed);
  }
  if (info.location) {
    Module.setObserverLocation(info.location.lat, info.location.lon, info.location.elevation);
  }
  if (info.direction) {
    Module.setObserverDirection(info.direction.azimuth, info.direction.altitude);
  }
  if (info.fov !== undefined) {
    Module.setFov(info.fov, duration);
  }
  if (info.projection !== undefined) {
    Module.setProjection(info.projection);
  }
}

// ============================================================================
// Performance Optimization API
// ============================================================================

/*
 * Function: setPerformanceSettings
 * Configure performance optimization settings.
 *
 * Parameters:
 *   settings - Object with:
 *     adaptiveFps: Boolean - Enable adaptive frame rate
 *     targetFps: Number - Target FPS (default: 60)
 *     minFps: Number - Minimum FPS (default: 30)
 *     skipFrames: Boolean - Allow frame skipping when overloaded
 *     maxStarsPerFrame: Number - Max stars per frame (0=unlimited)
 *     maxLabelsPerFrame: Number - Max labels per frame (0=unlimited)
 *     deferTextRender: Boolean - Defer text rendering
 */
Module['setPerformanceSettings'] = function(settings) {
  if (settings.adaptiveFps !== undefined) {
    Module.core.adaptive_fps = settings.adaptiveFps;
  }
  if (settings.targetFps !== undefined) {
    Module.core.target_fps = Math.max(1, Math.min(120, settings.targetFps));
  }
  if (settings.minFps !== undefined) {
    Module.core.min_fps = Math.max(1, Math.min(60, settings.minFps));
  }
  if (settings.skipFrames !== undefined) {
    Module.core.skip_frames = settings.skipFrames;
  }
  if (settings.maxStarsPerFrame !== undefined) {
    Module.core.max_stars_per_frame = Math.max(0, settings.maxStarsPerFrame);
  }
  if (settings.maxLabelsPerFrame !== undefined) {
    Module.core.max_labels_per_frame = Math.max(0, settings.maxLabelsPerFrame);
  }
  if (settings.deferTextRender !== undefined) {
    Module.core.defer_text_render = settings.deferTextRender;
  }
}

/*
 * Function: getPerformanceSettings
 * Get current performance settings.
 *
 * Return:
 *   Object with current performance settings.
 */
Module['getPerformanceSettings'] = function() {
  return {
    adaptiveFps: Module.core.adaptive_fps,
    targetFps: Module.core.target_fps,
    minFps: Module.core.min_fps,
    skipFrames: Module.core.skip_frames,
    maxStarsPerFrame: Module.core.max_stars_per_frame,
    maxLabelsPerFrame: Module.core.max_labels_per_frame,
    deferTextRender: Module.core.defer_text_render
  };
}

/*
 * Function: getPerformanceStats
 * Get performance statistics.
 *
 * Return:
 *   Object with FPS, frame time, and other metrics.
 */
Module['getPerformanceStats'] = function() {
  return {
    fps: Module.core.fps,
    avgFrameTime: Module.core.avg_frame_time,
    targetFps: Module.core.target_fps
  };
}

/*
 * Function: setLowPowerMode
 * Enable low-power mode for battery saving on mobile devices.
 *
 * Parameters:
 *   enabled - Boolean to enable/disable low-power mode
 */
Module['setLowPowerMode'] = function(enabled) {
  if (enabled) {
    Module.setPerformanceSettings({
      adaptiveFps: true,
      targetFps: 30,
      minFps: 15,
      skipFrames: true,
      maxStarsPerFrame: 5000,
      maxLabelsPerFrame: 50,
      deferTextRender: true
    });
    Module.setRenderQuality(0); // Low quality
    Module.setMobileSettings({
      pinchInertia: { enabled: true, friction: 0.85 },
      panInertia: { enabled: true, friction: 0.90 },
      renderQuality: { level: 0, labelDensity: 0.5 }
    });
  } else {
    Module.setPerformanceSettings({
      adaptiveFps: false,
      targetFps: 60,
      minFps: 30,
      skipFrames: false,
      maxStarsPerFrame: 0,
      maxLabelsPerFrame: 0,
      deferTextRender: false
    });
    Module.setRenderQuality(2); // High quality
  }
}

/*
 * Function: setHighPerformanceMode
 * Enable high-performance mode for powerful devices.
 *
 * Parameters:
 *   enabled - Boolean to enable/disable high-performance mode
 */
Module['setHighPerformanceMode'] = function(enabled) {
  if (enabled) {
    Module.setPerformanceSettings({
      adaptiveFps: false,
      targetFps: 60,
      minFps: 60,
      skipFrames: false,
      maxStarsPerFrame: 0,
      maxLabelsPerFrame: 0,
      deferTextRender: false
    });
    Module.setRenderQuality(2);
    Module.setStarScale(1.0, 1.2);
  } else {
    // Reset to defaults
    Module.setPerformanceSettings({
      adaptiveFps: false,
      targetFps: 60,
      minFps: 30,
      skipFrames: false,
      maxStarsPerFrame: 0,
      maxLabelsPerFrame: 0,
      deferTextRender: false
    });
  }
}

/*
 * Function: enableAdaptiveQuality
 * Enable automatic quality adjustment based on performance.
 */
Module['enableAdaptiveQuality'] = function() {
  Module.core.adaptive_fps = true;
  
  // Set up quality adjustment based on frame time
  var checkInterval = setInterval(function() {
    if (!Module.core) {
      clearInterval(checkInterval);
      return;
    }
    
    var avgFrameTime = Module.core.avg_frame_time;
    var targetFrameTime = 1000 / Module.core.target_fps;
    
    // If frame time is too high, reduce quality
    if (avgFrameTime > targetFrameTime * 1.5) {
      var currentQuality = Module.core.render_quality_level;
      if (currentQuality > 0) {
        Module.core.render_quality_level = currentQuality - 1;
        Module.core.render_label_density = Math.max(0.3, Module.core.render_label_density - 0.2);
      }
    }
    // If frame time is good, can increase quality
    else if (avgFrameTime < targetFrameTime * 0.7) {
      var currentQuality = Module.core.render_quality_level;
      if (currentQuality < 2) {
        Module.core.render_quality_level = currentQuality + 1;
        Module.core.render_label_density = Math.min(1.0, Module.core.render_label_density + 0.1);
      }
    }
  }, 2000); // Check every 2 seconds
  
  return checkInterval;
}

/*
 * Function: disableAdaptiveQuality
 * Disable automatic quality adjustment.
 *
 * Parameters:
 *   intervalId - The interval ID returned by enableAdaptiveQuality()
 */
Module['disableAdaptiveQuality'] = function(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
  }
  Module.core.adaptive_fps = false;
}

// ============================================================================
// Debug and Profiling API
// ============================================================================

/*
 * Function: enableDebugMode
 * Enable debug mode with performance overlay.
 */
Module['enableDebugMode'] = function() {
  Module._debugMode = true;
  console.log('[StellariumWeb] Debug mode enabled');
}

/*
 * Function: disableDebugMode
 * Disable debug mode.
 */
Module['disableDebugMode'] = function() {
  Module._debugMode = false;
  console.log('[StellariumWeb] Debug mode disabled');
}

/*
 * Function: logPerformance
 * Log performance information to console.
 */
Module['logPerformance'] = function() {
  var stats = Module.getPerformanceStats();
  var settings = Module.getPerformanceSettings();
  
  console.log('=== Stellarium Web Performance ===');
  console.log('FPS:', stats.fps);
  console.log('Avg Frame Time:', stats.avgFrameTime.toFixed(2), 'ms');
  console.log('Target FPS:', settings.targetFps);
  console.log('Adaptive FPS:', settings.adaptiveFps);
  console.log('Quality Level:', Module.core.render_quality_level);
  console.log('Label Density:', Module.core.render_label_density);
  console.log('================================');
}

/*
 * Function: benchmark
 * Run a simple performance benchmark.
 *
 * Parameters:
 *   duration - Duration of benchmark in seconds (default: 5)
 *   callback - Function called with results when complete
 */
Module['benchmark'] = function(duration, callback) {
  duration = duration || 5;
  var startTime = Date.now();
  var frameCount = 0;
  var minFps = Infinity;
  var maxFps = 0;
  var fpsReadings = [];
  
  var benchmarkLoop = function() {
    var elapsed = (Date.now() - startTime) / 1000;
    
    if (elapsed < duration) {
      frameCount++;
      var currentFps = Module.core.fps || 0;
      if (currentFps > 0) {
        fpsReadings.push(currentFps);
        minFps = Math.min(minFps, currentFps);
        maxFps = Math.max(maxFps, currentFps);
      }
      requestAnimationFrame(benchmarkLoop);
    } else {
      var avgFps = fpsReadings.length > 0 ? 
        fpsReadings.reduce(function(a, b) { return a + b; }, 0) / fpsReadings.length : 0;
      
      var results = {
        duration: duration,
        totalFrames: frameCount,
        avgFps: avgFps,
        minFps: minFps === Infinity ? 0 : minFps,
        maxFps: maxFps,
        recommendation: avgFps > 50 ? 'high' : (avgFps > 30 ? 'medium' : 'low')
      };
      
      console.log('=== Benchmark Results ===');
      console.log('Duration:', duration, 'seconds');
      console.log('Total Frames:', frameCount);
      console.log('Avg FPS:', avgFps.toFixed(1));
      console.log('Min FPS:', results.minFps);
      console.log('Max FPS:', results.maxFps);
      console.log('Recommended Quality:', results.recommendation);
      console.log('========================');
      
      if (callback) callback(results);
    }
  };
  
  console.log('Starting benchmark for', duration, 'seconds...');
  requestAnimationFrame(benchmarkLoop);
}

/*
 * Function: autoOptimize
 * Automatically detect device capabilities and set optimal settings.
 *
 * Parameters:
 *   callback - Optional callback with optimization results
 */
Module['autoOptimize'] = function(callback) {
  Module.benchmark(3, function(results) {
    var quality = results.recommendation;
    
    if (quality === 'low') {
      Module.setLowPowerMode(true);
      console.log('[StellariumWeb] Auto-optimized for low-end device');
    } else if (quality === 'medium') {
      Module.setPerformanceSettings({
        adaptiveFps: true,
        targetFps: 45,
        skipFrames: true,
        maxStarsPerFrame: 10000,
        maxLabelsPerFrame: 100
      });
      Module.setRenderQuality(1);
      console.log('[StellariumWeb] Auto-optimized for medium device');
    } else {
      Module.setHighPerformanceMode(true);
      console.log('[StellariumWeb] Auto-optimized for high-end device');
    }
    
    if (callback) callback(quality);
  });
}
