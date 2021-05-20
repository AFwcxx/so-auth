window.verified = new Vue({
  el: '#app',
  data: {
    show: true,
    message: '',
    responded: false,
    SoAuth: false,
    file: null,
    fileSrc: false
  },
  methods: {
    onSubmit: function (event) {
      this.SoAuth.exchange(this.message, '/secret').then(response => {
        if (response) {
          this.responded = response;
        }
      });
    },

    upload: function (event) {
      const vm = this;
      const reader = new FileReader();
      reader.readAsDataURL(this.file);

      reader.onload = function (e) {
        vm.$root.$data.SoAuth.exchange({ 
          file: e.target.result, 
          name: vm.file.name,
          size: vm.file.size,
          type: vm.file.type 
        }, '/media/upload').then(response => {
          if (response) {
            if (response.success && response.rdata) {
              vm.fileSrc = vm.$root.$data.SoAuth.endpoint + 'private/download/' + response.rdata + '?soauth=' + vm.$root.$data.SoAuth.token;
            } else {
              alert('Did not upload..');
            }
          }
        });
      }
    }
  },
  created: function() {
    this.SoAuth = new SoAuth({
      hostId: 'localhost:3000-sochain',
      endpoint: 'http://localhost:3000/'
    });
    this.SoAuth.load().then(good => {
      if (good === false) {
        window.location.replace("/");
      } else {
        window.history.replaceState({}, document.title, "/");
      }
    });
  }
});
