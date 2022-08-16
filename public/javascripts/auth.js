"use strict";

window.auth = new Vue({
  el: '#app',
  data: {
    loading: true,
    show: true,
    form: {
      password: 'VeRy-h@rd_p@s$w0rD',
      email: 'someone@email.com',
      message: '',
      hasError: false
    },
    SoAuth: false,
    spinner: {
      login: false,
      register: false
    }
  },
  methods: {
    submit: function (intention) {
      if (this.spinner[intention]) {
        return;
      }

      this.spinner[intention] = true;
      this.form.hasError = false;

      // Used to create deterministic signing keys
      let credential = {
        email: this.form.email,
        password: this.form.password
      };

      // Optional
      let meta = {
        email: this.form.email
      };

      this.SoAuth.negotiate(credential, intention, meta).then(response => {
        if (response && response.token !== undefined) {
          this.SoAuth.save();
          window.location.replace("?soauth=" + response.token);
        } else {
          this.spinner[intention] = false;
          this.form.hasError = true;
          this.form.message = "Invalid login";
        }
      });
    }
  },
  mounted: function() {
    this.SoAuth = new SoAuth({
      hostId: 'self',
      hostSignPublicKey: '<wallet-soauth-pubkey>',
      endpoint: document.getElementById("app-base").textContent,
      enableFingerprint: true
    });

    this.SoAuth.load().then(result => {
      if (result) {
        window.location.replace("?soauth=" + this.SoAuth.token);
      } else {
        this.loading = false;
      }
    });
  }
});
