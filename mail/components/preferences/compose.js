/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gComposePane = {
  mInitialized: false,
  mSpellChecker: null,
  mDictCount : 0,

  _loadInContent: Services.prefs.getBoolPref("mail.preferences.inContent"),

  init: function ()
  {
    this.enableAutocomplete();

    this.initLanguageMenu();

    this.populateFonts();

    this.updateAutosave();

    this.updateAttachmentCheck();

    this.updateEmailCollection();

    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = document.getElementById("mail.preferences.compose.selectedTabIndex");
      if (preference.value)
        document.getElementById("composePrefs").selectedIndex = preference.value;
    }

    if (this._loadInContent) {
      gSubDialog.init();
    }

    this.mInitialized = true;
  },

  tabSelectionChanged: function ()
  {
    if (this.mInitialized)
    {
      var preference = document.getElementById("mail.preferences.compose.selectedTabIndex");
      preference.valueFromPreferences = document.getElementById("composePrefs").selectedIndex;
    }
  },

  sendOptionsDialog: function()
  {
    if (this._loadInContent) {
      gSubDialog.open("chrome://messenger/content/preferences/sendoptions.xul");
    } else {
      document.documentElement
              .openSubDialog("chrome://messenger/content/preferences/sendoptions.xul",
                             "", null);
    }
  },

  attachmentReminderOptionsDialog: function()
  {
    if (this._loadInContent) {
      gSubDialog.open("chrome://messenger/content/preferences/attachmentReminder.xul",
                      "resizable=no");
    } else {
      document.documentElement
              .openSubDialog("chrome://messenger/content/preferences/attachmentReminder.xul",
                             "", null);
    }
  },

  updateAutosave: function()
  {
    this.enableElement(document.getElementById("autoSaveInterval"),
      document.getElementById("autoSave").checked);
  },

  updateAttachmentCheck: function()
  {
    this.enableElement(document.getElementById("attachment_reminder_button"),
      document.getElementById("attachment_reminder_label").checked);
  },

  updateEmailCollection: function()
  {
    this.enableElement(document.getElementById("localDirectoriesList"),
      document.getElementById("emailCollectionOutgoing").checked);
  },

  enableElement: function(aElement, aEnable)
  {
    let pref = aElement.getAttribute("preference");
    let prefIsLocked = pref ? document.getElementById(pref).locked : false;
    aElement.disabled = !aEnable || prefIsLocked;
  },

  enableAutocomplete: function()
  {
    var acLDAPPref = document.getElementById("ldap_2.autoComplete.useDirectory")
                             .value;

    this.enableElement(document.getElementById("directoriesList"), acLDAPPref);
    this.enableElement(document.getElementById("editButton"), acLDAPPref);
  },

  editDirectories: function()
  {
    if (this._loadInContent) {
      gSubDialog.open("chrome://messenger/content/addressbook/pref-editdirectories.xul");
    } else {
      window.openDialog("chrome://messenger/content/addressbook/pref-editdirectories.xul",
                        "editDirectories", "chrome,modal=yes,resizable=no", null);
    }
  },

  initLanguageMenu: function ()
  {
    var languageMenuList = document.getElementById("languageMenuList");
    this.mSpellChecker = Components.classes['@mozilla.org/spellchecker/engine;1'].getService(Components.interfaces.mozISpellCheckingEngine);
    var o1 = {};
    var o2 = {};

    // Get the list of dictionaries from
    // the spellchecker.

    this.mSpellChecker.getDictionaryList(o1, o2);

    var dictList = o1.value;
    var count    = o2.value;

    // if we don't have any dictionaries installed, disable the menu list
    languageMenuList.disabled = !count;

    // If dictionary count hasn't changed then no need to update the menu.
    if (this.mDictCount == count)
      return;

    // Store current dictionary count.
    this.mDictCount = count;

    // Load the string bundles that will help us map
    // RFC 1766 strings to UI strings.

    // Load the language string bundle.
    var languageBundle = document.getElementById("languageBundle");
    var regionBundle = null;
    // If we have a language string bundle, load the region string bundle.
    if (languageBundle)
      regionBundle = document.getElementById("regionBundle");

    var menuStr2;
    var isoStrArray;
    var langId;
    var langLabel;
    var i;

    for (i = 0; i < count; i++)
    {
      try {
        langId = dictList[i];
        isoStrArray = dictList[i].split(/[-_]/);

        if (languageBundle && isoStrArray[0])
          langLabel = languageBundle.getString(isoStrArray[0].toLowerCase());

        if (regionBundle && langLabel && isoStrArray.length > 1 && isoStrArray[1])
        {
          menuStr2 = regionBundle.getString(isoStrArray[1].toLowerCase());
          if (menuStr2)
            langLabel += "/" + menuStr2;
        }

        if (langLabel && isoStrArray.length > 2 && isoStrArray[2])
          langLabel += " (" + isoStrArray[2] + ")";

        if (!langLabel)
          langLabel = langId;
      } catch (ex) {
        // getString throws an exception when a key is not found in the
        // bundle. In that case, just use the original dictList string.
        langLabel = langId;
      }
      dictList[i] = [langLabel, langId];
    }

    // sort by locale-aware collation
    dictList.sort(
      function compareFn(a, b)
      {
        return a[0].localeCompare(b[0]);
      }
    );

    // Remove any languages from the list.
    var languageMenuPopup = languageMenuList.firstChild;
    while (languageMenuPopup.hasChildNodes())
      languageMenuPopup.lastChild.remove();

    // append the dictionaries to the menu list...
    for (i = 0; i < count; i++)
      languageMenuList.appendItem(dictList[i][0], dictList[i][1]);

    languageMenuList.setInitialSelection();
  },

  populateFonts: function()
  {
    var fontsList = document.getElementById("FontSelect");
    try
    {
      var enumerator = Components.classes["@mozilla.org/gfx/fontenumerator;1"]
                                 .getService(Components.interfaces.nsIFontEnumerator);
      var localFontCount = { value: 0 }
      var localFonts = enumerator.EnumerateAllFonts(localFontCount);
      for (var i = 0; i < localFonts.length; ++i)
      {
        // Remove Linux system generic fonts that collide with CSS generic fonts.
        if (localFonts[i] != "" && localFonts[i] != "serif" &&
            localFonts[i] != "sans-serif" && localFonts[i] != "monospace")
          fontsList.appendItem(localFonts[i], localFonts[i]);
      }
    }
    catch(e) { }
    // Choose the item after the list is completely generated.
    var preference = document.getElementById(fontsList.getAttribute("preference"));
    fontsList.value = preference.value;
   },

   restoreHTMLDefaults: function()
   {
     // reset throws an exception if the pref value is already the default so
     // work around that with some try/catch exception handling
     try {
       document.getElementById('msgcompose.font_face').reset();
     } catch (ex) {}

     try {
       document.getElementById('msgcompose.font_size').reset();
     } catch (ex) {}

     try {
       document.getElementById('msgcompose.text_color').reset();
     } catch (ex) {}

     try {
       document.getElementById('msgcompose.background_color').reset();
     } catch (ex) {}
   }
};
