"use strict";

import { webgl } from '../dist/human/webgl.js'
import soauth from '../dist/human/soauth.js'

const hostSignPublicKey = "94ab003eb7cb7777c41b34a987863a47c5898516ba2a0e8df835adbc23fdd826";
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
    const response = await soauth.negotiate('login', { username, password }, '/negotiate', { username });
    console.log('response', response);

    if (response === true) {
      $('.toggle-disable').prop('disabled', false);
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
  soauth.save();
  window.location.replace("/browser-test?reload=true")
}

if (window.location.search === '?reload=true') {
  let loaded = await soauth.load({
    hostId, hostSignPublicKey, hostEndpoint, webgl,
    expired_callback: function () {
      window.location.reload();
    }
  });

  if (loaded) {
    soauth.clear_local_storage();
    $('.toggle-disable').prop('disabled', false);
  } else {
    window.location.replace("/browser-test")
  }
}
