window.verified = new Vue({
  el: '#app',
  data: {
    show: true,
    message: '',
    responded: false,
    SoAuth: false,
    file: null,
    fileSrc: false,
    showMessageSpinner: false,
    showUploadSpinner: false
  },
  methods: {
    onSubmit: function (event) {
      this.showMessageSpinner = true;
      let vm = this;

      this.SoAuth.clone().exchange(this.message, '/secret').then(response => {
        vm.showMessageSpinner = false;
        if (response) {
          this.responded = response;
        }
      });
    },

    upload: function (event) {
      this.showUploadSpinner = true;
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
          vm.showUploadSpinner = false;
          if (response) {
            if (response.success && response.rdata) {
              vm.fileSrc = vm.$root.$data.SoAuth.endpoint + 'private/download/' + response.rdata + '?soauth=' + vm.$root.$data.SoAuth.token;
            } else {
              alert('Did not upload..');
            }
          }
        });
      }
    },

    logout: function () {
      this.SoAuth.logout().then(result => {
        if (result) {
          window.location.reload();
        }
      });
    }
  },
  mounted: function() {
    this.SoAuth = new SoAuth({
      hostSignPublicKey: '31a986bde8d64d8167df151179641eb5bff547bbb018271f119e73f68d1cfb0b',
      endpoint: 'http://localhost:3000/'
    });

    this.SoAuth.load().then(result => {
      if (result === false) {
        window.location.replace("/");
      } else {
        window.history.replaceState({}, document.title, "/");
      }
    });
  }
});
