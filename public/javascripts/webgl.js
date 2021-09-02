"use strict";

class WebGl {
  constructor() {
    let _this = this;

    this.fingerprint = false;
    this.hash = false;
    this.canvas = false;
    this.agent = navigator.userAgent;
    this.resolve = false;

    this.ready = new Promise(resolve => {
      _this.resolve = resolve;
    });

    let canvas, ctx;

    const width = 256;
    const height = 128;

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
    }
    catch (err) {
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

      this.sha256(img_fingerprint).then(hash => {
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
}

