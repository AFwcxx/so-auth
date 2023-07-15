"use strict";

const http = require("http");
const https = require("https");

// https://stackoverflow.com/a/54409977
class BigDecimal {
  constructor(value) {
    let [ints, decis] = String(value).split(".").concat("");
    decis = decis.padEnd(BigDecimal.decimals, "0");
    this.bigint = BigInt(ints + decis);
  }
  static fromBigInt(bigint) {
    return Object.assign(Object.create(BigDecimal.prototype), { bigint });
  }
  divide(divisor) { // You would need to provide methods for other operations
    return BigDecimal.fromBigInt(this.bigint * BigInt("1" + "0".repeat(BigDecimal.decimals)) / divisor.bigint);
  }
  toString() {
    const s = this.bigint.toString().padStart(BigDecimal.decimals+1, "0");
    return s.slice(0, -BigDecimal.decimals) + "." + s.slice(-BigDecimal.decimals);
  }
}

// EXPORT --
exports.isJsonString = isJsonString;
exports.ucWord = ucWord;
exports.arithmetic = arithmetic;
exports.monthDiff = monthDiff;
exports.post = post;
exports.get = get;
exports.intToStr = intToStr;


function isJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

function ucWord(str) {
  return str.toLowerCase().replace(/\b[a-z]/g, function(letter) {
    return letter.toUpperCase();
  });
}

function arithmetic(operation, a, b, decimal) {
  // Replace coma if exists
  let re = new RegExp(',', 'g');
  a = parseFloat(a.toString().replace(re, ''));
  b = parseFloat(b.toString().replace(re, ''));

  // To integer
  a = a * (10 ** decimal);
  b = b * (10 ** decimal);

  if (operation === '+') {
    return intToStr(a + b, decimal);
  } else if (operation === '-') {
    return intToStr(a - b, decimal);
  } else {
    return false;
  }
}

// Convert integer to decimal string
function intToStr(num, decimal) {
  if (typeof num === 'string') {
    num = num.replace(',', '');
  } else {
    num = num.toLocaleString('fullwide', {useGrouping:false});
  }

  let prepend = '';

  if (num.includes('-')) {
    prepend = '-';
    num = num.replace(/-/g, '');
  }

  BigDecimal.decimals = decimal; // Configuration of the number of decimals you want to have.

  let a = new BigDecimal(num);
  let b = new BigDecimal("1" + "0".repeat(decimal));

  return prepend + a.divide(b).toString();
}

function monthDiff(dateFrom, dateTo) {
  return dateTo.getMonth() - dateFrom.getMonth() + (12 * (dateTo.getFullYear() - dateFrom.getFullYear()));
}

function get(url, getData, headers) {
  if (url.indexOf('https') > -1) {
    return httpsGet(url, getData, headers);
  }
  return httpGet(url, getData, headers);
}

function post(url, postData, headers) {
  if (url.indexOf('https') > -1) {
    return httpsPost(url, postData, headers);
  }
  return httpPost(url, postData, headers);
}


// Support

function httpGet(url, getData, headers) {
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

      if (headers && typeof headers === 'object') {
        for (let k in headers) {
          if (headers.hasOwnProperty(k)) {
            options.headers[k] = headers[k];
          }
        }
      }

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

      req.on('error', function (error) {
        reject(error);
      });

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

function httpPost(url, postData, headers) {
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

    if (headers && typeof headers === 'object') {
      for (let k in headers) {
        if (headers.hasOwnProperty(k)) {
          options.headers[k] = headers[k];
        }
      }
    }

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

    req.on('error', function (error) {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function httpsGet(url, getData, headers) {
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

      if (headers && typeof headers === 'object') {
        for (let k in headers) {
          if (headers.hasOwnProperty(k)) {
            options.headers[k] = headers[k];
          }
        }
      }

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

      req.on('error', function (error) {
        reject(error);
      });

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

function httpsPost(url, postData, headers) {
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

    if (headers && typeof headers === 'object') {
      for (let k in headers) {
        if (headers.hasOwnProperty(k)) {
          options.headers[k] = headers[k];
        }
      }
    }

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

    req.on('error', function (error) {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}
