"use strict";

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
      let vm = this;

      this.showMessageSpinner = true;
      this.SoAuth.clone().exchange(this.message, '/api/secret').then(response => {
        vm.showMessageSpinner = false;

        if (response.success) {
          vm.responded = response.rdata;
        }
      });
    },

    upload: function (event) {
      this.showUploadSpinner = true;

      let vm = this;
      let reader = new FileReader();

      reader.readAsDataURL(this.file);

      reader.onload = function (e) {
        vm.$root.$data.SoAuth.exchange({ 
          file: e.target.result, 
          name: vm.file.name,
          size: vm.file.size,
          type: vm.file.type 
        }, '/api/media/upload').then(response => {
          vm.showUploadSpinner = false;

          if (response.success && response.rdata) {
            vm.fileSrc = vm.$root.$data.SoAuth.endpoint + '/private/download/' + response.rdata + '?soauth=' + vm.$root.$data.SoAuth.token;
          } else {
            alert('Did not upload..');
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
      hostId: 'self',
      hostSignPublicKey: '31a986bde8d64d8167df151179641eb5bff547bbb018271f119e73f68d1cfb0b',
      endpoint: document.getElementById("app-base").textContent,
      enableFingerprint: true
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
