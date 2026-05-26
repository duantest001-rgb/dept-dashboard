# Logout Fix Patch (auth.js)

ໃຫ້ຊອກ function logout ເກົ່າໃນ `js/auth.js`
ແລ້ວປ່ຽນທັງໝົດເປັນ code ນີ້:

```js
// ==========================================
// LOGOUT SYSTEM FIX
// ==========================================

let __loggingOut = false;

async function logout() {

  // BLOCK DOUBLE CLICK
  if (__loggingOut) return;

  __loggingOut = true;

  try {

    // LOGOUT BUTTON
    const btn = document.getElementById('logoutBtn');

    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '.6';
      btn.innerHTML = '⏳ Logging out...';
    }

    // STOP REALTIME CHANNELS
    try {
      if (db?.removeAllChannels) {
        await db.removeAllChannels();
      }
    } catch (e) {
      console.warn('remove channels fail', e);
    }

    // SIGN OUT
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    // CLEAR STORAGE
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn(e);
    }

    // RESET GLOBAL STATE
    window.APP_STATE = {};

    // HARD RELOAD
    window.location.replace(
      window.location.pathname
    );

  } catch (err) {

    console.error(err);

    alert(
      'Logout failed: ' + err.message
    );

    __loggingOut = false;

    const btn = document.getElementById('logoutBtn');

    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = 'Logout';
    }
  }
}
```

## ກວດ HTML ເພີ່ມ

ປຸ່ມ logout ຄວນມີແບບນີ້ພຽງບ່ອນດຽວ:

```html
<button id="logoutBtn" onclick="logout()">
  Logout
</button>
```

## ຫ້າມມີ addEventListener ຊ້ຳ

ຖ້າມີ code ແນວນີ້:

```js
logoutBtn.addEventListener('click', logout)
```

ໃຫ້ລຶບອອກ ຖ້າໃຊ້ `onclick="logout()"` ຢູ່ແລ້ວ.

## ຜົນຫຼັງແກ້

* ກົດ logout ຄັ້ງດຽວອອກ
* ບໍ່ຕ້ອງກົດ 2-3 ເທື່ອ
* realtime channel ບໍ່ຄ້າງ
* local/session cache ຖືກ clear
* browser state ບໍ່ຕີກັນ
* mobile/desktop stable ຂຶ້ນ
