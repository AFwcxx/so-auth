"use strict";

const GL_UNSUPPORTED = 0;
const GL_SUPPORTED = 1;
const GL_DISABLED = 2;
const GL_BLOCKED = 3;

class WebGl {
  constructor() {
    let _this = this;

    this.fingerprint = false;
    this.hash = false;
    this.canvas = false;
    this.agent = navigator.userAgent;
    this.resolve = false;
    this.configurations = {};

    this.ready = new Promise(resolve => {
      _this.resolve = resolve;
    });

    let canvas, ctx;

    const width = 256;
    const height = 128;

    this.render();
    // this.show();

    try {
      // Create canvas
      canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      ctx = canvas.getContext("webgl2")
        || canvas.getContext("experimental-webgl2")
        || canvas.getContext("webgl")
        || canvas.getContext("experimental-webgl")
        || canvas.getContext("moz-webgl");
    } catch (err) {
      console.warn("Unable to create canvas. Is WebGL supported?", err);
    }

    if (ctx === null){
      return false;
    }

    try {
      let d = ctx.createBuffer();

      ctx.bindBuffer(ctx.ARRAY_BUFFER, d);

      let e = new Float32Array([-.2, -.9, 0, .4, -.26, 0, 0, .7321, 0]);

      ctx.bufferData(ctx.ARRAY_BUFFER, e, ctx.STATIC_DRAW);

      d.itemSize = 3;
      d.numItems = 3;

      let f = ctx.createProgram();
      let vtx_shader = ctx.createShader(ctx.VERTEX_SHADER);

      ctx.shaderSource(vtx_shader,
        "attribute vec2 attrVertex;" +
        "varying vec2 varyinTexCoordinate;" +
        "uniform vec2 uniformOffset;" +
        "void main(){"+
        "    varyinTexCoordinate = attrVertex + uniformOffset;" +
        "    gl_Position = vec4(attrVertex, 0, 1);" + 
        "}"
      );

      ctx.compileShader(vtx_shader);

      let frag_shader = ctx.createShader(ctx.FRAGMENT_SHADER);

      ctx.shaderSource(frag_shader,
        "precision mediump float;" + 
        "varying vec2 varyinTexCoordinate;" +
        "void main(){" + 
        "    gl_FragColor = vec4(varyinTexCoordinate, 0, 1);" +
        "}"
      );

      ctx.compileShader(frag_shader);
      ctx.attachShader(f, vtx_shader);
      ctx.attachShader(f, frag_shader);
      ctx.linkProgram(f);
      ctx.useProgram(f);

      f.vertexPosAttrib = ctx.getAttribLocation(f, "attrVertex");
      f.offsetUniform = ctx.getUniformLocation(f, "uniformOffset");

      ctx.enableVertexAttribArray(f.vertexPosArray);
      ctx.vertexAttribPointer(f.vertexPosAttrib, d.itemSize, ctx.FLOAT, false, 0, 0);
      ctx.uniform2f(f.offsetUniform, 1, 1);
      ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, d.numItems);

      this.canvas = canvas;
    }
    catch (err) {
      console.warn("Draw WebGL Image", err);
    }

    let img_fingerprint = "";

    try {
      // 256x128 is size, 4 bytes for RGBA
      const picture_webgl_size = 256 * 128 * 4;

      let j = new Uint8Array(picture_webgl_size);

      ctx.readPixels(0, 0, 256, 128, ctx.RGBA, ctx.UNSIGNED_BYTE, j);
      img_fingerprint = JSON.stringify(j).replace(/,?"[0-9]+":/g, "");

      if (img_fingerprint.replace(/^{[0]+}$/g, "") == "") {
        throw "JSON.stringify only ZEROes";
      }

      let detection = JSON.stringify(this.configurations);

      this.sha256(img_fingerprint + detection).then(hash => {
        _this.fingerprint = hash;

        this.sha256(hash + this.agent).then(hash => {
          _this.hash = hash;
          _this.resolve(true);
        })
      });
    }
    catch (err) {
      console.warn("WebGL Image", err);
    }
  }

  async sha256(message) {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  }

  // Detection ==

  add(subject, key, value) {
    if (this.configurations[subject] === undefined) {
      this.configurations[subject] = {};
    }

    this.configurations[subject][key] = value;
  }

  show() {
    console.log(this.configurations, Object.keys(this.configurations.functions).length);
  }

  render() {
    let webgl_1_status = GL_UNSUPPORTED;
    let webgl_2_status = GL_UNSUPPORTED;

    if (window.WebGLRenderingContext){
      webgl_1_status = GL_SUPPORTED;
    }

    if (window.WebGL2RenderingContext){
      webgl_2_status = GL_SUPPORTED;
    }

    let is_webgl2_supported = !!window.WebGL2RenderingContext;
    let webgl_impl = this.webglDetect();
    let supported_webgl_implementations = webgl_impl.name;

    this.add('info', 'implementations', webgl_impl.name);

    if (GL_SUPPORTED === webgl_1_status && !webgl_impl) {
      webgl_1_status = GL_DISABLED;
    }

    if (GL_SUPPORTED === webgl_2_status) {
      const webgl_2_implementations = supported_webgl_implementations.filter(function (impl){
        return impl.slice(-1) === "2";
      });

      if (webgl_2_implementations.length === 0){
        webgl_2_status = GL_DISABLED;
      }
    }

    let maximum_webgl_version = 0;

    if (webgl_impl) {
      let render_context = webgl_impl.gl;

      if ("2" === webgl_impl.name[0].slice(-1)) {
        maximum_webgl_version = 2;
        this.add('info', 'WebGLVersion', 2);
      }
      else {
        if ("fake-webgl" === webgl_impl.name[0]
          || "function" !== typeof render_context.getParameter
          && "object" !== typeof render_context.getParameter) {
          webgl_1_status = GL_BLOCKED;
          return false;
        }

        maximum_webgl_version = 1;
        this.add('info', 'WebGLVersion', 1);
      }

      if (is_webgl2_supported && 2 === maximum_webgl_version) {
        const WEBGL_FUNCTIONS = ["copyBufferSubData"
          , "getBufferSubData"
          , "blitFramebuffer"
          , "framebufferTextureLayer"
          , "getInternalformatParameter"
          , "invalidateFramebuffer"
          , "invalidateSubFramebuffer"
          , "readBuffer"
          , "renderbufferStorageMultisample"
          , "texStorage2D"
          , "texStorage3D"
          , "texImage3D"
          , "texSubImage3D"
          , "copyTexSubImage3D"
          , "compressedTexImage3D"
          , "compressedTexSubImage3D"
          , "getFragDataLocation"
          , "uniform1ui"
          , "uniform2ui"
          , "uniform3ui"
          , "uniform4ui"
          , "uniform1uiv"
          , "uniform2uiv"
          , "uniform3uiv"
          , "uniform4uiv"
          , "uniformMatrix2x3fv"
          , "uniformMatrix3x2fv"
          , "uniformMatrix2x4fv"
          , "uniformMatrix4x2fv"
          , "uniformMatrix3x4fv"
          , "uniformMatrix4x3fv"
          , "vertexAttribI4i"
          , "vertexAttribI4iv"
          , "vertexAttribI4ui"
          , "vertexAttribI4uiv"
          , "vertexAttribIPointer"
          , "vertexAttribDivisor"
          , "drawArraysInstanced"
          , "drawElementsInstanced"
          , "drawRangeElements"
          , "drawBuffers"
          , "clearBufferiv"
          , "clearBufferuiv"
          , "clearBufferfv"
          , "clearBufferfi"
          , "createQuery"
          , "deleteQuery"
          , "isQuery"
          , "beginQuery"
          , "endQuery"
          , "getQuery"
          , "getQueryParameter"
          , "createSampler"
          , "deleteSampler"
          , "isSampler"
          , "bindSampler"
          , "samplerParameteri"
          , "samplerParameterf"
          , "getSamplerParameter"
          , "fenceSync"
          , "isSync"
          , "deleteSync"
          , "clientWaitSync"
          , "waitSync"
          , "getSyncParameter"
          , "createTransformFeedback"
          , "deleteTransformFeedback"
          , "isTransformFeedback"
          , "bindTransformFeedback"
          , "beginTransformFeedback"
          , "endTransformFeedback"
          , "transformFeedbackVaryings"
          , "getTransformFeedbackVarying"
          , "pauseTransformFeedback"
          , "resumeTransformFeedback"
          , "bindBufferBase"
          , "bindBufferRange"
          , "getIndexedParameter"
          , "getUniformIndices"
          , "getActiveUniforms"
          , "getUniformBlockIndex"
          , "getActiveUniformBlockParameter"
          , "getActiveUniformBlockName"
          , "uniformBlockBinding"
          , "createVertexArray"
          , "deleteVertexArray"
          , "isVertexArray"
          , "bindVertexArray"];

        for (let func_idx = 0; func_idx < WEBGL_FUNCTIONS.length; func_idx++) {
          let gl_function_name = WEBGL_FUNCTIONS[func_idx];

          if (render_context[gl_function_name]){
            this.add('functions', gl_function_name, true);
          } else {
            this.add('functions', gl_function_name, true);
          }
        }
      }

      let webgl_params = ["VERSION"
        , "SHADING_LANGUAGE_VERSION"
        , "VENDOR", "RENDERER"
        , "MAX_VERTEX_ATTRIBS"
        , "MAX_VERTEX_UNIFORM_VECTORS"
        , "MAX_VERTEX_TEXTURE_IMAGE_UNITS"
        , "MAX_VARYING_VECTORS"
        , "ALIASED_LINE_WIDTH_RANGE"
        , "ALIASED_POINT_SIZE_RANGE"
        , "MAX_FRAGMENT_UNIFORM_VECTORS"
        , "MAX_TEXTURE_IMAGE_UNITS"
        , "RED_BITS", "GREEN_BITS", "BLUE_BITS", "ALPHA_BITS"
        , "DEPTH_BITS", "STENCIL_BITS"
        , "MAX_RENDERBUFFER_SIZE"
        , "MAX_VIEWPORT_DIMS"
        , "MAX_TEXTURE_SIZE"
        , "MAX_CUBE_MAP_TEXTURE_SIZE"
        , "MAX_COMBINED_TEXTURE_IMAGE_UNITS"];

      if (2 === maximum_webgl_version) {
        const webgl_v2_params = ["MAX_VERTEX_UNIFORM_COMPONENTS"
          , "MAX_VERTEX_UNIFORM_BLOCKS"
          , "MAX_VERTEX_OUTPUT_COMPONENTS"
          , "MAX_VARYING_COMPONENTS"
          , "MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS"
          , "MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS"
          , "MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS"
          , "MAX_FRAGMENT_UNIFORM_COMPONENTS"
          , "MAX_FRAGMENT_UNIFORM_BLOCKS"
          , "MAX_FRAGMENT_INPUT_COMPONENTS"
          , "MIN_PROGRAM_TEXEL_OFFSET"
          , "MAX_PROGRAM_TEXEL_OFFSET"
          , "MAX_DRAW_BUFFERS"
          , "MAX_COLOR_ATTACHMENTS"
          , "MAX_SAMPLES"
          , "MAX_3D_TEXTURE_SIZE"
          , "MAX_ARRAY_TEXTURE_LAYERS"
          , "MAX_TEXTURE_LOD_BIAS"
          , "MAX_UNIFORM_BUFFER_BINDINGS"
          , "MAX_UNIFORM_BLOCK_SIZE"
          , "UNIFORM_BUFFER_OFFSET_ALIGNMENT"
          , "MAX_COMBINED_UNIFORM_BLOCKS"
          , "MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS"
          , "MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS"];

        webgl_params = webgl_params.concat(webgl_v2_params)
      }

      for (let i = 0; i < webgl_params.length; i++) {
        let webgl_param_value = render_context.getParameter(render_context[webgl_params[i]]);

        if (null === webgl_param_value) {
          webgl_param_value = "n/a";
        } else {
          if (("object" === typeof webgl_param_value) && (null !== webgl_param_value)) {
            webgl_param_value = this.expandParamPair(webgl_param_value);
          }
        }

        this.add('params', webgl_params[i], webgl_param_value);
      }

      this.add('params', 'ANTIALIASING', this.getAntialiasingString(render_context));

      let debug_renderer_info = this.rendererInfo(render_context);
      this.add('params', 'UNMASKED_VENDOR', debug_renderer_info.vendor);
      this.add('params', 'UNMASKED_RENDERER', debug_renderer_info.renderer);
      this.add('params', 'ANGLE', this.getANGLE(render_context));
      this.add('params', 'MAX_ANISOTROPY', this.getAnisotropy(render_context));
      this.add('params', 'MAJOR_PERFORMANCE_CAVEAT', this.getMajorPerformanceCaveat(webgl_impl.name[0]));

      if(1 === maximum_webgl_version) {
        this.add('params', 'MAX_DRAW_BUFFERS', this.getMaxDrawBuffers(render_context));
      }

      this.add('params', 'FLOAT_INT_PRECISION', this.getFloatIntPrecision(render_context));
      this.add('params', 'SUPPORTED_WEBGl_EXTENSIONS', this.getWebGLExtensions(render_context).webgl);
      this.add('params', 'SUPPORTED_PRIVILEGED_EXTENSIONS', this.getWebGLExtensions(render_context).privileged);
      this.add('params', 'BEST_FLOAT_PRECISION', this.describePrecision(render_context, render_context.VERTEX_SHADER));

      this.destroyWebgl(render_context);
    }
  }

  webglDetect() {
    const gl_implementations = [
      "webgl2", "experimental-webgl2", "webgl", "experimental-webgl", "moz-webgl", "fake-webgl"
    ];

    let supported_implementations = [];
    let ctx = false;
    let impl_ctx = ctx;

    for (let index in gl_implementations) {
      impl_ctx = false;

      try {
        impl_ctx = document.createElement("canvas").getContext(gl_implementations[index], { stencil: true });

        if (impl_ctx){
          if (ctx) {
            this.destroyWebgl(impl_ctx);
          } else {
            ctx = impl_ctx;
          }

          supported_implementations.push(gl_implementations[index]);
        }
      } catch (err) {
        console.warn("Issue webglDetect");
      }
    }
    return !!ctx && { name: supported_implementations, gl: ctx }
  }

  expandParamPair(pair_param) {
    return null == pair_param ? "null" : "[" + pair_param[0] + ", " + pair_param[1] + "]"
  }

  getAntialiasingString(render_ctx) {
    let bool_2_string = false;

    try {
      bool_2_string = render_ctx.getContextAttributes().antialias
    } catch (err) {
      console.warn('Issue getAntialiasingString');
    }

    return bool_2_string ? "True" : "False"
  }

  rendererInfo(render_ctx) {
    let renderer_html_info = { renderer: "render_ctx", vendor: "render_ctx" };
    let webgl_renderer_info = render_ctx.getExtension("WEBGL_debug_renderer_info");

    if (null != webgl_renderer_info) {
      renderer_html_info.renderer = render_ctx.getParameter(webgl_renderer_info.UNMASKED_RENDERER_WEBGL);
    }

    renderer_html_info.vendor = render_ctx.getParameter(webgl_renderer_info.UNMASKED_VENDOR_WEBGL);

    return renderer_html_info;
  }

  /// ANGLE - Almost Native Graphics Layer Engine
  /// See details at: https://chromium.googlesource.com/angle/angle/+/master/README.md
  getANGLE(render_ctx) {

    function b(a) {
      return 0 !== a && 0 === (a & a - 1);
    }

    let c = this.expandParamPair(render_ctx.getParameter(render_ctx.ALIASED_LINE_WIDTH_RANGE));

    return "Win32" !== navigator.platform
      && "Win64" !== navigator.platform
      || "Internet Explorer" === render_ctx.getParameter(render_ctx.RENDERER)
      || "Microsoft Edge" === render_ctx.getParameter(render_ctx.RENDERER)
      || c !== this.expandParamPair([1, 1]) ? "False" : b(render_ctx.getParameter(render_ctx.MAX_VERTEX_UNIFORM_VECTORS))
      && b(render_ctx.getParameter(render_ctx.MAX_FRAGMENT_UNIFORM_VECTORS)) ? "True, Direct3D 11" : "True, Direct3D 9";
  }

  getAnisotropy(gl) {
    let b = gl.getExtension("EXT_texture_filter_anisotropic")
      || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic")
      || gl.getExtension("MOZ_EXT_texture_filter_anisotropic");

    if (b) {
      let c = gl.getParameter(b.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      return 0 === c && (c = 2), c;
    }
    return "n/a"
  }

  getMajorPerformanceCaveat(gl) {
    try {
      let canv = document.createElement('canvas');

      canv.style.height = '1px';
      canv.style.width = '1px';

      document.body.appendChild(canv);

      let ctx = canv.getContext(gl, { failIfMajorPerformanceCaveat: true });

      canv.remove();

      if (ctx) {
        if (void 0 === ctx.getContextAttributes().failIfMajorPerformanceCaveat) {
          this.destroyWebgl(ctx);
          return "Not implemented";
        } else {
          this.destroyWebgl(ctx);
          return "False";
        }
      } else {
        return "True";
      }
    } catch (err) {
      return "n/gl";
    }
  }

  getMaxDrawBuffers(gl) {
    let b = 0;
    let draw_buffers_ext = gl.getExtension("WEBGL_draw_buffers");

    if (draw_buffers_ext !== null) {
      b = gl.getParameter(draw_buffers_ext.MAX_DRAW_BUFFERS_WEBGL);
    }

    return b;
  }

  getFloatIntPrecision(gl) {
    try {
      let frag_prec_h_float = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      let frag_prec_h_int = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_INT);

      let text = 0 !== frag_prec_h_float.precision ? "highp/" : "mediump/";

      text += 0 !== frag_prec_h_int.rangeMax ? "highp" : "lowp";

      return text;
    } catch (err) {
      return "n/a";
    }
  }

  getWebGLExtensions(gl) {
    let webgl = [], privileged = [], extensions = [];

    try {
      extensions = gl.getSupportedExtensions();
    } catch (err) {
      console.warn("Unable to get gl extensions");
    }

    if (extensions !== undefined && extensions.length){
      for (let i = 0; i < extensions.length; i++) {
        if ("WEBGL_debug_renderer_info" != extensions[i] && "WEBGL_debug_shaders" != extensions[i]){
          webgl.push(extensions[i]);
        } else {
          privileged.push(extensions[i]);
        }
      }
    } else {
      return false;
    }

    return {
      webgl: webgl,
      privileged: privileged
    };
  }

  renderRangeValue(value, as_number) {
    return as_number ? "" + Math.pow(2, value) : "2^" + value;
  }

  renderRange(value, as_number) {
    let c = as_number ? " bit mantissa" : "";

    return "[-" + this.renderRangeValue(value.rangeMin, as_number) + ", " + this.renderRangeValue(value.rangeMax, as_number) + "] (" + value.precision + c + ")"
  }

  describePrecision(gl, shaderType) {
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getShaderPrecisionFormat
    try {
      let high = gl.getShaderPrecisionFormat(shaderType, gl.HIGH_FLOAT),
        med = gl.getShaderPrecisionFormat(shaderType, gl.MEDIUM_FLOAT),
        low = gl.getShaderPrecisionFormat(shaderType, gl.LOW_FLOAT), 
        label = high;

      if (high.precision === 0) {
        label = med;
      }

      return {
        high: this.renderRange(high, true),
        medium: this.renderRange(med, true),
        low: this.renderRange(low, true),
        range: this.renderRange(label, false)
      };
    } catch (err) {
      return false;
    }
  }

  destroyWebgl(gl) {
    try {
      let lc_ext = gl.getExtension("WEBGL_lose_context") 
        || gl.getExtension("WEBKIT_WEBGL_lose_context")
        || gl.getExtension("MOZ_WEBGL_lose_context");

      if (lc_ext !== null) {
        lc_ext.loseContext();
      }
    } catch (err) {
      console.warn("Unable to lose gl context");
    }
  }
}
