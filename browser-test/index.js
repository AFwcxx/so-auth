"use strict";

import { webgl } from '../dist/human/webgl.js'
import soauth from '../dist/human/soauth.js'

const hostSignPublicKey = "02a131f6c11648f43757163d71622ac524e303e2e68c0e5bad4eaec07437847c";
const hostId = "test-host-id";
const hostEndpoint = "http://127.0.0.1:3000";

await soauth.setup({
  hostId, hostSignPublicKey, hostEndpoint, webgl,
  expired_callback: function () {
    window.location.reload();
  }
});

window.register = async function () {
  const username = $('#username').val();
  const password = $('#password').val();
  
  try {
    const response = await soauth.negotiate('register', { username, password }, '/negotiate', { username });
    console.log('response', response);
    $('.toggle-disable').prop('disabled', true);
  } catch (err) {
    console.log('err', err.message || err);
  }
}

window.login = async function () {
  const username = $('#username').val();
  const password = $('#password').val();
  
  try {
    const token = await soauth.negotiate('login', { username, password }, '/negotiate', { username });
    console.log('token', token);

    if (token) {
      $('.toggle-disable').prop('disabled', false);
      $('.toggle-display').removeAttr('style');

      $('#secret-resource').attr('src',`${hostEndpoint}/private/secret-map.jpg?soauth=${token}`)
    } else {
      $('.toggle-disable').prop('disabled', true);
    }
  } catch (err) {
    console.log('err', err.message || err);
  }
}

window.send = async function () {
  const message = $('#message').val();
  
  try {
    const response = await soauth.exchange(message, '/message');
    $('#server').val(response);
  } catch (err) {
    console.log('err', err.message || err);
  }
}

window.reload = async function () {
  const secret = "secret";
  await soauth.save(secret);
  window.location.replace("/browser-test?reload=true")
}

if (window.location.search === '?reload=true') {
  const secret = "secret";

  const loaded = await soauth.load(secret, {
    hostId, hostSignPublicKey, hostEndpoint, webgl,
    expired_callback: function () {
      window.location.reload();
    }
  });

  if (loaded) {
    // soauth.clear_local_storage();
    $('.toggle-disable').prop('disabled', false);
  } else {
    window.location.replace("/browser-test")
  }
}
