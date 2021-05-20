"use strict";

const http = require("http");
const https = require("https");

// EXPORT --
exports.isJsonString = isJsonString;
exports.httpGet = httpGet;
exports.httpPost = httpPost;
exports.httpsGet = httpsGet;
exports.httpsPost = httpsPost;


function isJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

function httpGet(url, getData) {
  return new Promise((resolve, reject) => {
    if (typeof getData !== "undefined") {
      url = new URL(url);
      let options = {
        'method': 'GET',
        'hostname': url.hostname,
        'port': url.port,
        'path': url.pathname,
        'headers': {
          'Content-Type': 'application/json'
        },
        'maxRedirects': 20
      };

      let req = http.request(options, function (res) {
        let chunks = [];

        res.on("data", function (chunk) {
          chunks.push(chunk);
        });

        res.on("end", function (chunk) {
          let body = Buffer.concat(chunks).toString();
          if (isJsonString(body)) {
            resolve(JSON.parse(body));
          } else {
            reject("Unexpected GET request result.");
          }
        });

        res.on("error", function (error) {
          reject(error);
        });
      });

      if (typeof getData !== 'string') {
        getData = JSON.stringify(getData);
      }
      req.write(getData);
      req.end();
    } else {
      http.get(url, (resp) => {
        let data = '';

        resp.on('data', (chunk) => {
          data += chunk;
        });

        resp.on('end', () => {
          if (isJsonString(data)) {
            data = JSON.parse(data);
            resolve(data);
          } else {
            reject("Unexpected GET request result.");
          }
        });

      }).on("error", (err) => {
        reject(err);
      });
    }
  });
}

function httpPost(url, postData) {
  return new Promise((resolve, reject) => {
    url = new URL(url);

    let options = {
      'method': 'POST',
      'hostname': url.hostname,
      'port': url.port,
      'path': url.pathname,
      'headers': {
        'Content-Type': 'application/json'
      },
      'maxRedirects': 20
    };

    let req = http.request(options, function (res) {
      let chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function (chunk) {
        let body = Buffer.concat(chunks).toString();
        if (isJsonString(body)) {
          resolve(JSON.parse(body));
        } else {
          reject("Unexpected POST request result.");
        }
      });

      res.on("error", function (error) {
        reject(error);
      });
    });

    if (typeof postData !== 'string') {
      postData = JSON.stringify(postData);
    }

    req.write(postData);
    req.end();
  });
}

function httpsGet(url, getData) {
  return new Promise((resolve, reject) => {
    if (typeof getData !== "undefined") {
      url = new URL(url);
      let options = {
        'method': 'GET',
        'hostname': url.hostname,
        'port': url.port,
        'path': url.pathname,
        'headers': {
          'Content-Type': 'application/json'
        },
        'maxRedirects': 20
      };

      let req = https.request(options, function (res) {
        let chunks = [];

        res.on("data", function (chunk) {
          chunks.push(chunk);
        });

        res.on("end", function (chunk) {
          let body = Buffer.concat(chunks).toString();
          if (isJsonString(body)) {
            resolve(JSON.parse(body));
          } else {
            reject("Unexpected GET request result.");
          }
        });

        res.on("error", function (error) {
          reject(error);
        });
      });

      if (typeof getData !== 'string') {
        getData = JSON.stringify(getData);
      }
      req.write(getData);
      req.end();
    } else {
      https.get(url, (resp) => {
        let data = '';

        resp.on('data', (chunk) => {
          data += chunk;
        });

        resp.on('end', () => {
          if (isJsonString(data)) {
            data = JSON.parse(data);
            resolve(data);
          } else {
            reject("Unexpected GET request result.");
          }
        });

      }).on("error", (err) => {
        reject(err);
      });
    }
  });
}

function httpsPost(url, postData) {
  return new Promise((resolve, reject) => {
    url = new URL(url);
    let options = {
      'method': 'POST',
      'hostname': url.hostname,
      'port': url.port,
      'path': url.pathname,
      'headers': {
        'Content-Type': 'application/json'
      },
      'maxRedirects': 20
    };

    let req = https.request(options, function (res) {
      let chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function (chunk) {
        let body = Buffer.concat(chunks).toString();
        if (isJsonString(body)) {
          resolve(JSON.parse(body));
        } else {
          reject("Unexpected POST request result.");
        }
      });

      res.on("error", function (error) {
        reject(error);
      });
    });

    if (typeof postData !== 'string') {
      postData = JSON.stringify(postData);
    }

    req.write(postData);
    req.end();
  });
}
