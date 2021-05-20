window.auth = new Vue({
  el: '#app',
  data: {
    show: true,
    form: {
      password: 'VeRy-h@rd_p@s$w0rD',
      email: 'afwcxx@email.com',
      message: '',
      hasError: false
    },
    SoAuth: false,
  },
  methods: {
    submit: function (intention) {
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
          this.form.hasError = true;
          this.form.message = "Invalid login";
        }
      });
    }
  },
  created: function() {
    this.SoAuth = new SoAuth({
      hostId: 'localhost:3000-sochain',
      endpoint: 'http://localhost:3000/'
    });
  }
});
