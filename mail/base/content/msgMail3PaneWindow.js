/** ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Communicator client code, released
 * March 31, 1998.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998-1999
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Jan Varga (varga@nixcorp.com)
 *   Håkan Waara (hwaara@chello.se)
 *   Neil Rashbrook (neil@parkwaycc.co.uk)
 *   Seth Spitzer <sspitzer@netscape.com>
 *   David Bienvenu <bienvenu@nventure.com>
 *   Jeremy Morton <bugzilla@game-point.net>
 *   Steffen Wilberg <steffen.wilberg@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource://gre/modules/folderUtils.jsm");
Components.utils.import("resource://app/modules/activity/activityModules.js");
Components.utils.import("resource://app/modules/jsTreeSelection.js");
Components.utils.import("resource://app/modules/MailConsts.js");

/* This is where functions related to the 3 pane window are kept */

// from MailNewsTypes.h
const nsMsgKey_None = 0xFFFFFFFF;
const nsMsgViewIndex_None = 0xFFFFFFFF;
const kMailCheckOncePrefName = "mail.startup.enabledMailCheckOnce";

const kStandardPaneConfig = 0;
const kWidePaneConfig = 1;
const kVerticalPaneConfig = 2;

const kNumFolderViews = 4; // total number of folder views

/** widget with id=messagepanebox, initialized by GetMessagePane() */
var gMessagePane;

var gThreadAndMessagePaneSplitter = null;
/**
 * Tracks whether the right mouse button changed the selection or not.  If the
 * user right clicks on the selection, it stays the same.  If they click outside
 * of it, we alter the selection (but not the current index) to be the row they
 * clicked on.
 *
 * The value of this variable is an object with "view" and "selection" keys
 * and values.  The view value is the view whose selection we saved off, and
 * the selection value is the selection object we saved off.
 */
var gRightMouseButtonSavedSelection = null;
var gNewAccountToLoad = null;

var gDisplayStartupPage = false;

// the folderListener object
var folderListener = {
    OnItemAdded: function(parentItem, item) { },

    OnItemRemoved: function(parentItem, item) { },

    OnItemPropertyChanged: function(item, property, oldValue, newValue) { },

    OnItemIntPropertyChanged: function(item, property, oldValue, newValue) {
      if (item == gFolderDisplay.displayedFolder) {
        if(property.toString() == "TotalMessages" || property.toString() == "TotalUnreadMessages") {
          UpdateStatusMessageCounts(gFolderDisplay.displayedFolder);
        }
      }
    },

    OnItemBoolPropertyChanged: function(item, property, oldValue, newValue) { },

    OnItemUnicharPropertyChanged: function(item, property, oldValue, newValue) { },
    OnItemPropertyFlagChanged: function(item, property, oldFlag, newFlag) { },

    OnItemEvent: function(folder, event) {
      var eventType = event.toString();
      if (eventType == "ImapHdrDownloaded") {
        if (folder) {
          var imapFolder = folder.QueryInterface(Components.interfaces.nsIMsgImapMailFolder);
          if (imapFolder) {
            var hdrParser = imapFolder.hdrParser;
            if (hdrParser) {
              var msgHdr = hdrParser.GetNewMsgHdr();
              if (msgHdr)
              {
                var hdrs = hdrParser.headers;
                if (hdrs && hdrs.indexOf("X-attachment-size:") > 0) {
                  msgHdr.OrFlags(Components.interfaces.nsMsgMessageFlags
                                           .Attachment);
                }
                if (hdrs && hdrs.indexOf("X-image-size:") > 0) {
                  msgHdr.setStringProperty("imageSize", "1");
                }
              }
            }
          }
        }
      }
      else if (eventType == "JunkStatusChanged") {
        HandleJunkStatusChanged(folder);
      }
    }
}

function ServerContainsFolder(server, folder)
{
  if (!folder || !server)
    return false;

  return server.equals(folder.server);
}

function SelectServer(server)
{
  gFolderTreeView.selectFolder(server.rootFolder);
}

// we have this incoming server listener in case we need to
// alter the folder pane selection when a server is removed
// or changed (currently, when the real username or real hostname change)
var gThreePaneIncomingServerListener = {
    onServerLoaded: function(server) {},
    onServerUnloaded: function(server) {
      var selectedFolders = GetSelectedMsgFolders();
      for (var i = 0; i < selectedFolders.length; i++) {
        if (ServerContainsFolder(server, selectedFolders[i])) {
          SelectServer(accountManager.defaultAccount.incomingServer);
          // we've made a new selection, we're done
          return;
        }
      }

      // if nothing is selected at this point, better go select the default
      // this could happen if nothing was selected when the server was removed
      selectedFolders = GetSelectedMsgFolders();
      if (selectedFolders.length == 0) {
        SelectServer(accountManager.defaultAccount.incomingServer);
      }
    },
    onServerChanged: function(server) {
      // if the current selected folder is on the server that changed
      // and that server is an imap or news server,
      // we need to update the selection.
      // on those server types, we'll be reconnecting to the server
      // and our currently selected folder will need to be reloaded
      // or worse, be invalid.
      if (server.type != "imap" && server.type !="nntp")
        return;

      var selectedFolders = GetSelectedMsgFolders();
      for (var i = 0; i < selectedFolders.length; i++) {
        // if the selected item is a server, we don't have to update
        // the selection
        if (!(selectedFolders[i].isServer) && ServerContainsFolder(server, selectedFolders[i])) {
          SelectServer(server);
          // we've made a new selection, we're done
          return;
        }
      }
    }
}

// aMsgWindowInitialized: false if we are calling from the onload handler, otherwise true
function UpdateMailPaneConfig(aMsgWindowInitialized) {
  const dynamicIds = ["messagesBox", "mailContent", "threadPaneBox"];
  const layouts = ["standard", "wide", "vertical"];
  var layoutView = gPrefBranch.getIntPref("mail.pane_config.dynamic");
  var desiredId = dynamicIds[layoutView];
  document.getElementById("mailContent")
          .setAttribute("layout", layouts[layoutView]);
  var messagePane = GetMessagePane();
  if (messagePane.parentNode.id != desiredId) {
    ClearAttachmentList();
    var messagePaneSplitter = GetThreadAndMessagePaneSplitter();
    var desiredParent = document.getElementById(desiredId);
    // See Bug 381992. The ctor for the browser element will fire again when we
    // re-insert the messagePaneBox back into the document.
    // But the dtor doesn't fire when the element is removed from the document.
    // Manually call destroy here to avoid a nasty leak.
    document.getElementById("messagepane").destroy();
    desiredParent.appendChild(messagePaneSplitter);
    desiredParent.appendChild(messagePane);
    messagePaneSplitter.orient = desiredParent.orient;
    if (aMsgWindowInitialized)
    {
      messenger.setWindow(null, null);
      messenger.setWindow(window, msgWindow);
      if (gDBView && GetNumSelectedMessages() == 1)
        gDBView.reloadMessage();
    }
  }
}

const MailPrefObserver = {
  observe: function(subject, topic, prefName) {
    // verify that we're changing the mail pane config pref
    if (topic == "nsPref:changed")
    {
      if (prefName == "mail.pane_config.dynamic")
        UpdateMailPaneConfig(true);
    }
  }
};

function AutoConfigWizard(okCallback)
{
  NewMailAccount(msgWindow, okCallback);
}

/**
 * Called on startup to initialize various parts of the main window
 */
function OnLoadMessenger()
{
  // update the pane config before we exit onload otherwise the user may see a flicker if we poke the document
  // in delayedOnLoadMessenger...
  UpdateMailPaneConfig(false);
  document.loadBindingDocument('chrome://global/content/bindings/textbox.xml');

  // Set a sane starting width/height for all resolutions on new profiles.
  // Do this before the window loads.
  if (!document.documentElement.hasAttribute("width"))
  {
    // Prefer 1024xfull height.
    let defaultHeight = screen.availHeight;
    let defaultWidth = (screen.availWidth <= 1024) ? screen.availWidth : 1024;

    // On small screens, default to maximized state.
    if (defaultHeight <= 600)
      document.documentElement.setAttribute("sizemode", "maximized");

    document.documentElement.setAttribute("width", defaultWidth);
    document.documentElement.setAttribute("height", defaultHeight);
    // Make sure we're safe at the left/top edge of screen
    document.documentElement.setAttribute("screenX", screen.availLeft);
    document.documentElement.setAttribute("screenY", screen.availTop);
  }

  gPrefBranch.QueryInterface(Components.interfaces.nsIPrefBranch2);
  gPrefBranch.addObserver("mail.pane_config.dynamic", MailPrefObserver, false);

  MailOfflineMgr.init();
  CreateMailWindowGlobals();
  GetMessagePane().collapsed = true;

  // - initialize tabmail system
  // Do this before LoadPostAccountWizard since that code selects the first
  //  folder for display, and we want gFolderDisplay setup and ready to handle
  //  that event chain.
  // Also, we definitely need to register the tab type prior to the call to
  //  specialTabs.openSpecialTabsOnStartup below.
  let tabmail = document.getElementById('tabmail');
  if (tabmail)
  {
    // mailTabType is defined in mailWindowOverlay.js
    tabmail.registerTabType(mailTabType);
    // glodaFacetTab* in glodaFacetTab.js
    tabmail.registerTabType(glodaFacetTabType);
    tabmail.registerTabMonitor(QuickSearchTabMonitor);
    tabmail.registerTabMonitor(statusMessageCountsMonitor);
    tabmail.openFirstTab();
  }

  // verifyAccounts returns true if the callback won't be called
  // We also don't want the account wizard to open if any sort of account exists
  if (verifyAccounts(LoadPostAccountWizard, false, AutoConfigWizard))
    LoadPostAccountWizard();

  // This also registers the contentTabType ("contentTab")
  specialTabs.openSpecialTabsOnStartup();

  window.addEventListener("AppCommand", HandleAppCommandEvent, true);
}

function LoadPostAccountWizard()
{
  InitMsgWindow();
  messenger.setWindow(window, msgWindow);

  InitPanes();
  MigrateAttachmentDownloadStore();
  MigrateJunkMailSettings();
  MigrateFolderViews();
  MigrateOpenMessageBehavior();

  accountManager.setSpecialFolders();
  accountManager.loadVirtualFolders();
  accountManager.addIncomingServerListener(gThreePaneIncomingServerListener);

  gPhishingDetector.init();

  AddToSession();

  //need to add to session before trying to load start folder otherwise listeners aren't
  //set up correctly.

  let startFolderURI = null, startMsgHdr = null;
  if ("arguments" in window && window.arguments.length > 0)
  {
    let arg0 = window.arguments[0];
    // If the argument is a string, it is either a folder URI or a feed URI
    if (typeof arg0 == "string")
    {
      // filter our any feed urls that came in as arguments to the new window...
      if (/^feed:/i.test(arg0))
      {
        let feedHandler = Components.classes["@mozilla.org/newsblog-feed-downloader;1"]
          .getService(Components.interfaces.nsINewsBlogFeedDownloader);
        if (feedHandler)
          feedHandler.subscribeToFeed(arg0, null, msgWindow);
      }
      else
      {
        startFolderURI = arg0;
      }
    }
    else if (arg0)
    {
      // arg0 is an object
      if (("wrappedJSObject" in arg0) && arg0.wrappedJSObject) 
        arg0 = arg0.wrappedJSObject;
      startMsgHdr = ("msgHdr" in arg0) ? arg0.msgHdr : null;
    }
  }

  function completeStartup() {
    // Check whether we need to show the default client dialog
    // First, check the shell service
    var nsIShellService = Components.interfaces.nsIShellService;
    if (nsIShellService) {
      var shellService;
      var defaultAccount;
      try {
        shellService = Components.classes["@mozilla.org/mail/shell-service;1"].getService(nsIShellService);
        defaultAccount = accountManager.defaultAccount;
      } catch (ex) {}

      // Next, try loading the search integration module
      // We'll get a null SearchIntegration if we don't have one
      Components.utils.import("resource://app/modules/SearchIntegration.js");

      // Show the default client dialog only if
      // EITHER: we have at least one account, and we aren't already the default
      // for mail,
      // OR: we have the search integration module, the OS version is suitable,
      // and the first run hasn't already been completed.
      // Needs to be shown outside the he normal load sequence so it doesn't appear
      // before any other displays, in the wrong place of the screen.
      if ((shellService && defaultAccount && shellService.shouldCheckDefaultClient
           && !shellService.isDefaultClient(true, nsIShellService.MAIL)) ||
        (SearchIntegration && !SearchIntegration.osVersionTooLow &&
         !SearchIntegration.osComponentsNotRunning && !SearchIntegration.firstRunDone))
        window.openDialog("chrome://messenger/content/systemIntegrationDialog.xul",
                          "SystemIntegration", "modal,centerscreen,chrome,resizable=no");
    }

    // All core modal dialogs are done, the user can now interact with the 3-pane window
    var obs = Components.classes["@mozilla.org/observer-service;1"]
                        .getService(Components.interfaces.nsIObserverService);
    obs.notifyObservers(window, "mail-startup-done", null);
  }

  setTimeout(completeStartup, 0);

  // FIX ME - later we will be able to use onload from the overlay
  OnLoadMsgHeaderPane();

  //Set focus to the Thread Pane the first time the window is opened.
  SetFocusThreadPane();

  // initialize the customizeDone method on the customizeable toolbar
  var toolbox = document.getElementById("mail-toolbox");
  toolbox.customizeDone = function(aEvent) { MailToolboxCustomizeDone(aEvent, "CustomizeMailToolbar"); };

  var toolbarset = document.getElementById('customToolbars');
  toolbox.toolbarset = toolbarset;

  // XXX Do not select the folder until the window displays or the threadpane
  //  will be at minimum size.  We used to have
  //  gFolderDisplay.ensureRowIsVisible use settimeout itself to defer that
  //  calculation, but that was ugly.  Also, in theory we will open the window
  //  faster if we let the event loop start doing things sooner.
  if (startMsgHdr)
    window.setTimeout(loadStartMsgHdr, 0, startMsgHdr);
  else
    window.setTimeout(loadStartFolder, 0, startFolderURI);
}

function HandleAppCommandEvent(evt)
{
  evt.stopPropagation();
  switch (evt.command) {
    case "Back":
      goDoCommand('cmd_goBack');
      break;
    case "Forward":
      goDoCommand('cmd_goForward');
      break;
    case "Stop":
      msgWindow.StopUrls();
      break;
    case "Search":
      goDoCommand('cmd_search');
      break;
    case "Bookmarks":
      toAddressBook();
      break;
    case "Home":
    case "Reload":
    default:
      break;
  }
}

/**
 * Look for another 3-pane window.
 */
function FindOther3PaneWindow()
{
  let windowMediator =
    Components.classes["@mozilla.org/appshell/window-mediator;1"]
        .getService(Components.interfaces.nsIWindowMediator);
  // XXX We'd like to use getZOrderDOMWindowEnumerator here, but it doesn't work
  // on Linux
  let enumerator = windowMediator.getEnumerator("mail:3pane");
  while (enumerator.hasMoreElements()) {
    let win = enumerator.getNext();
    if (win != window)
      return win;
  }
  return null;
}

/**
 * Called by messenger.xul:onunload, the 3-pane window inside of tabs window.
 *  It's being unloaded!  Right now!
 */
function OnUnloadMessenger()
{
  accountManager.removeIncomingServerListener(gThreePaneIncomingServerListener);
  gPrefBranch.QueryInterface(Components.interfaces.nsIPrefBranch2);
  gPrefBranch.removeObserver("mail.pane_config.dynamic", MailPrefObserver);

  // - Persist the tab state and then close the tabs. If another 3-pane window
  //   is open, do not persist tab state.
  // XXX do not assume there is only ever one 3-pane.
  if (!FindOther3PaneWindow())
    persistTabState();

  let tabmail = document.getElementById("tabmail");
  tabmail.closeTabs();

  var mailSession = Components.classes["@mozilla.org/messenger/services/session;1"]
                              .getService(Components.interfaces.nsIMsgMailSession);
  mailSession.RemoveFolderListener(folderListener);

  gPhishingDetector.shutdown();

  // FIX ME - later we will be able to use onload from the overlay
  OnUnloadMsgHeaderPane();

  UnloadPanes();

  OnMailWindowUnload();
}

/**
 * This currently only happens at window unload.
 */
function persistTabState()
{
  let tabmail = document.getElementById('tabmail');
  let tabsState = tabmail.persistTabs();
  // build the state like we aren't assuming a single 3-pane
  let state = {
    rev: 0,
    windows: [{
        type: "3pane",
        tabs: tabsState
      }
    ]
  };
  let data = JSON.stringify(state);
  let file = Components.classes["@mozilla.org/file/directory_service;1"]
                       .getService(Components.interfaces.nsIProperties)
                       .get("ProfD", Components.interfaces.nsIFile);
  file.append("session.json");
  let foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                   .createInstance(Components.interfaces.nsIFileOutputStream);
  foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);
  foStream.write(data, data.length);
  foStream.close();
}

// XXX provides GlodaUtils, remove once we migrate loadFileToString
Components.utils.import("resource://app/modules/gloda/utils.js");

/**
 * Attempt to restore our tab states.  This should only be called by
 * |loadStartFolder| or |loadStartMsgHdr|.
 *
 * @param aDontRestoreFirstTab If this is true, the first tab will not be
 *                             restored, and will continue to retain focus at
 *                             the end. This is needed if the window was opened
 *                             with a folder or a message as an argument.
 */
function atStartupRestoreTabs(aDontRestoreFirstTab) {
  let file = Components.classes["@mozilla.org/file/directory_service;1"]
                       .getService(Components.interfaces.nsIProperties)
                       .get("ProfD", Components.interfaces.nsIFile);
  file.append("session.json");
  if (!file.exists())
    return false;

  // XXX migrate loadFileToString to MessengerUtils once it exists (it's in
  //  another patch)
  let data = GlodaUtils.loadFileToString(file);

  // delete the file before restoring state in case there is something
  //  crash-inducing about the restoration process.  Also, this avoids weird
  //  3pane behavior if you open any additional 3panes.
  file.remove(false);

  let state = JSON.parse(data);
  let tabsState = state.windows[0].tabs;
  let tabmail = document.getElementById('tabmail');
  tabmail.restoreTabs(tabsState, aDontRestoreFirstTab);

  return true;
}

function loadExtraTabs()
{
  if ("arguments" in window && window.arguments.length >= 2) {
    if (window.arguments[1] && "tabType" in window.arguments[1]) {
      document.getElementById('tabmail').openTab(window.arguments[1].tabType, window.arguments[1].tabParams);
    }
  }
}

/**
 * Loads the given message header at window open. Exactly one out of this and
 * |loadStartFolder| should be called.
 *
 * @param aStartMsgHdr The message header to load at window open
 */
function loadStartMsgHdr(aStartMsgHdr)
{
  setTimeout(loadExtraTabs, 0);

  // We'll just clobber the default tab
  atStartupRestoreTabs(true);

  MsgDisplayMessageInFolderTab(aStartMsgHdr);
}

function loadStartFolder(initialUri)
{
  setTimeout(loadExtraTabs, 0);
    var defaultServer = null;
    var startFolder;
    var isLoginAtStartUpEnabled = false;

    if (!initialUri) {
      // Look to see if a master password is set, if so prompt for it to try
      // and avoid the multiple master password prompts on startup scenario.
      let token =
        Components.classes["@mozilla.org/security/pk11tokendb;1"]
                  .getService(Components.interfaces.nsIPK11TokenDB)
                  .getInternalKeyToken();

      // If an empty string is valid for the internal token, then we don't
      // have a master password, else, if it does, then try to login.
      try {
        if (!token.checkPassword(""))
          token.login(false);
      }
      catch (ex) {
      // If user cancels an exception is expected. checkPassword also
      // seems to fail w/ mozmill.
      }
    }

    // If a URI was explicitly specified, we'll just clobber the default tab
    let loadFolder = !atStartupRestoreTabs(!!initialUri);
    if (initialUri)
      loadFolder = true;

    //First get default account
    try
    {
        if(initialUri)
            startFolder = GetMsgFolderFromUri(initialUri);
        else
        {
            var defaultAccount = accountManager.defaultAccount;

            defaultServer = defaultAccount.incomingServer;
            var rootMsgFolder = defaultServer.rootMsgFolder;

            startFolder = rootMsgFolder;

            // Enable check new mail once by turning checkmail pref 'on' to bring
            // all users to one plane. This allows all users to go to Inbox. User can
            // always go to server settings panel and turn off "Check for new mail at startup"
            if (!gPrefBranch.getBoolPref(kMailCheckOncePrefName))
            {
                gPrefBranch.setBoolPref(kMailCheckOncePrefName, true);
                defaultServer.loginAtStartUp = true;
            }

            // Get the user pref to see if the login at startup is enabled for default account
            isLoginAtStartUpEnabled = defaultServer.loginAtStartUp;

            // Get Inbox only if login at startup is enabled.
            if (isLoginAtStartUpEnabled)
            {
                //now find Inbox
                var outNumFolders = new Object();
                const kInboxFlag = Components.interfaces.nsMsgFolderFlags.Inbox;
                var inboxFolder = rootMsgFolder.getFolderWithFlags(kInboxFlag);
                if (!inboxFolder) return;

                startFolder = inboxFolder;
            }
        }

        // it is possible we were given an initial uri and we need to subscribe or try to add
        // the folder. i.e. the user just clicked on a news folder they aren't subscribed to from a browser
        // the news url comes in here.

        // Perform biff on the server to check for new mail, except for imap
        // or a pop3 account that is deferred or deferred to,
        // or the case where initialUri is non-null (non-startup)
        if (!initialUri && isLoginAtStartUpEnabled
            && !defaultServer.isDeferredTo &&
            defaultServer.rootFolder == defaultServer.rootMsgFolder)
          defaultServer.performBiff(msgWindow);
        if (loadFolder) {
          try {
            gFolderTreeView.selectFolder(startFolder);
          } catch(ex) {
            // This means we tried to select a folder that isn't in the current
            // view. Just select the first one in the view then.
            if (gFolderTreeView._rowMap.length)
              gFolderTreeView.selectFolder(gFolderTreeView._rowMap[0]._folder);
          }
        }
    }
    catch(ex)
    {
      // this is the case where we're trying to auto-subscribe to a folder.
      if (initialUri && !startFolder.parent)
      {
        // hack to force display of thread pane.
        ShowingThreadPane();
        messenger.loadURL(window, initialUri);
        return;
      }

      dump(ex);
      dump('Exception in LoadStartFolder caused by no default account.  We know about this\n');
    }

    MsgGetMessagesForAllServers(defaultServer);

    if (MailOfflineMgr.isOnline()) {
      // Check if we shut down offline, and restarted online, in which case
      // we may have offline events to playback. Since this is not a pref
      // the user should set, it's not in mailnews.js, so we need a try catch.
      let playbackOfflineEvents = false;
      try {
        playbackOfflineEvents = gPrefBranch.getBoolPref("mailnews.playback_offline");
      }
      catch(ex) {}
      if (playbackOfflineEvents)
      {
        gPrefBranch.setBoolPref("mailnews.playback_offline", false);
        MailOfflineMgr.offlineManager.goOnline(false, true, msgWindow);
      }

      // If appropriate, send unsent messages. This may end up prompting the user,
      // so we need to get it out of the flow of the normal load sequence.
      function checkUnsent() {
        if (MailOfflineMgr.shouldSendUnsentMessages())
          SendUnsentMessages();
      }
      setTimeout(checkUnsent, 0);
    }
}

function AddToSession()
{
  var mailSession = Components.classes["@mozilla.org/messenger/services/session;1"]
                              .getService(Components.interfaces.nsIMsgMailSession);
  var nsIFolderListener = Components.interfaces.nsIFolderListener;
  var notifyFlags = nsIFolderListener.intPropertyChanged | nsIFolderListener.event;
  mailSession.AddFolderListener(folderListener, notifyFlags);
}

function InitPanes()
{
  gFolderTreeView.load(document.getElementById("folderTree"),
                       "folderTree.json");
  var folderTree = document.getElementById("folderTree");
  folderTree.addEventListener("click",FolderPaneOnClick,true);
  folderTree.addEventListener("mousedown",TreeOnMouseDown,true);
  var threadTree = document.getElementById("threadTree");
  threadTree.addEventListener("click",ThreadTreeOnClick,true);

  OnLoadThreadPane();
  SetupCommandUpdateHandlers();
}

function UnloadPanes()
{
  var threadTree = document.getElementById("threadTree");
  threadTree.removeEventListener("click",ThreadTreeOnClick,true);
  var folderTree = document.getElementById("folderTree");
  folderTree.removeEventListener("click",FolderPaneOnClick,true);
  folderTree.removeEventListener("mousedown",TreeOnMouseDown,true);
  gFolderTreeView.unload("folderTree.json");
  UnloadCommandUpdateHandlers();
}

/**
 * Abuse the threadpane UI version preference to know whether we should mark all
 * IMAP folders as offline.
 *
 * Very important note!  Although I am writing this comment and renamed the
 * function, this is not my doing and by reading this function and not fixing it
 * yourself, you are just as guilty as me, which is not guilty at all, but
 * it certainly won't improve your karma.
 *
 * This used to do things related to updating the visible columns and reordering
 * them, but that is now handled by FolderDisplayWidget.
 */
function UpgradeProfileAndBeUglyAboutIt()
{
  var threadPaneUIVersion;

  try {

    threadPaneUIVersion = gPrefBranch.getIntPref("mailnews.ui.threadpane.version");

    if (threadPaneUIVersion < 7)
    {
      // Mark all imap folders as offline at the very first run of TB v3
      // We use the threadpane ui version to determine TB profile version
      let servers = Components.classes["@mozilla.org/messenger/account-manager;1"]
                      .getService(Components.interfaces.nsIMsgAccountManager).allServers;

      for each (let server in fixIterator(servers, Components.interfaces.nsIMsgIncomingServer))
      {
        if (server.type != "imap")
          continue;

        let allFolders = Components.classes["@mozilla.org/supports-array;1"]
                          .createInstance(Components.interfaces.nsISupportsArray);
        server.rootFolder.ListDescendents(allFolders);
        for each (let folder in fixIterator(allFolders, Components.interfaces.nsIMsgFolder))
          folder.setFlag(Components.interfaces.nsMsgFolderFlags.Offline);
      }

      // Open a tab explaining the major changes between 2 and 3.
      window.setTimeout(openFeatureConfigurator, 300, [true,]);

      gPrefBranch.setIntPref("mailnews.ui.threadpane.version", 7);

    } // version 7 upgrades
  }
  catch (ex) {
    Components.utils.reportError(ex);
  }
}

function OnLoadThreadPane()
{
  // Register a listener on the columns element so that we get a notification
  //  whenever attributes on the columns change.  Because of the XBL bindings
  //  I think we also get the column picker too, but our filtering to only the
  //  attributes we care about takes care of that.
  document.getElementById("threadCols").addEventListener(
    "DOMAttrModified",
    function(aEvent) {
      // we only care about hidden status and ordinal
      if (aEvent.attrName != "hidden" &&
          aEvent.attrName != "ordinal")
        return;
      if (gFolderDisplay)
        gFolderDisplay.hintColumnsChanged();
    },
    true);

  UpgradeProfileAndBeUglyAboutIt();
}

/* Functions for accessing particular parts of the window*/
function GetMessagePane()
{
  if (!gMessagePane)
    gMessagePane = document.getElementById("messagepanebox");
  return gMessagePane;
}

function GetMessagePaneFrame()
{
  // We must use the message pane element directly here, as other tabs can
  // have browser elements as well (which could be set to content-primary,
  // which would confuse things with a window.content return).
  return document.getElementById("messagepane").contentWindow;
}

function getMailToolbox()
{
  return document.getElementById("mail-toolbox");
}

function FindInSidebar(currentWindow, id)
{
  var item = currentWindow.document.getElementById(id);
  if (item)
    return item;

  for (var i = 0; i < currentWindow.frames.length; ++i)
  {
    var frameItem = FindInSidebar(currentWindow.frames[i], id);
    if (frameItem)
      return frameItem;
  }

  return null;
}

function GetThreadAndMessagePaneSplitter()
{
  if (!gThreadAndMessagePaneSplitter)
    gThreadAndMessagePaneSplitter = document.getElementById('threadpane-splitter');
  return gThreadAndMessagePaneSplitter;
}

function IsMessagePaneCollapsed()
{
  return document.getElementById("threadpane-splitter")
                 .getAttribute("state") == "collapsed";
}

function ClearThreadPaneSelection()
{
  gFolderDisplay.clearSelection();
}

function ClearMessagePane()
{
  // hide the message header view AND the message pane...
  HideMessageHeaderPane();
  gMessageNotificationBar.clearMsgNotifications();
  ClearPendingReadTimer();
  GetMessagePaneFrame().location.href = "about:blank";
}

/**
 * When right-clicks happen, we do not want to corrupt the underlying
 * selection.  The right-click is a transient selection.  So, unless the
 * user is right-clicking on the current selection, we create a new
 * selection object (thanks to JSTreeSelection) and set that as the
 * current/transient selection.
 *
 * It is up you to call RestoreSelectionWithoutContentLoad to clean up when we
 * are done.
 *
 * @param aSingleSelect Should the selection we create be a single selection?
 *     This is relevant if the row being clicked on is already part of the
 *     selection.  If it is part of the selection and !aSingleSelect, then we
 *     leave the selection as is.  If it is part of the selection and
 *     aSingleSelect then we create a transient single-row selection.
 */
function ChangeSelectionWithoutContentLoad(event, tree, aSingleSelect)
{
  var treeBoxObj = tree.treeBoxObject;
  if (!treeBoxObj) {
    event.stopPropagation();
    return;
  }

  var treeSelection = treeBoxObj.view.selection;

  var row = treeBoxObj.getRowAt(event.clientX, event.clientY);
  // Only do something if:
  // - the row is valid
  // - it's not already selected (or we want a single selection)
  if (row >= 0 &&
      (aSingleSelect || !treeSelection.isSelected(row))) {
    // Check if the row is exactly the existing selection.  In that case
    //  there is no need to create a bogus selection.
    if (treeSelection.count == 1) {
      let minObj = {};
      treeSelection.getRangeAt(0, minObj, {});
      if (minObj.value == row) {
        event.stopPropagation();
        return;
      }
    }

    let transientSelection = new JSTreeSelection(treeBoxObj);
    transientSelection.logAdjustSelectionForReplay();

    gRightMouseButtonSavedSelection = {
      view: treeBoxObj.view,
      realSelection: treeSelection,
      transientSelection: transientSelection
    };

    var saveCurrentIndex = treeSelection.currentIndex;

    // tell it to log calls to adjustSelection
    // attach it to the view
    treeBoxObj.view.selection = transientSelection;
    // Don't generate any selection events! (we never set this to false, because
    //  that would generate an event, and we never need one of those from this
    //  selection object.
    transientSelection.selectEventsSuppressed = true;
    transientSelection.select(row);
    transientSelection.currentIndex = saveCurrentIndex;
    treeBoxObj.ensureRowIsVisible(row);
  }
  event.stopPropagation();
}

function TreeOnMouseDown(event)
{
    // Detect right mouse click and change the highlight to the row
    // where the click happened without loading the message headers in
    // the Folder or Thread Pane.
    // Same for middle click, which will open the folder/message in a tab.
    if (event.button == 2 || event.button == 1)
    {
      // We want a single selection if this is a middle-click (button 1)
      ChangeSelectionWithoutContentLoad(event, event.target.parentNode,
                                        event.button == 1);
    }
}

function FolderPaneContextMenuNewTab(event)
{
  var bgLoad = gPrefBranch.getBoolPref("mail.tabs.loadInBackground");
  if (event.shiftKey)
    bgLoad = !bgLoad;
  MsgOpenNewTabForFolder(bgLoad);
}

function FolderPaneOnClick(event)
{
  var folderTree = document.getElementById("folderTree");

  // Middle click on a folder opens the folder in a tab
  if (event.button == 1 && event.originalTarget.localName != "slider" &&
      event.originalTarget.localName != "scrollbarbutton")
  {
    FolderPaneContextMenuNewTab(event);
    RestoreSelectionWithoutContentLoad(folderTree);
  }
  else if (event.button == 0)
  {
    var row = {};
    var col = {};
    var elt = {};
    folderTree.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, elt);
    if (row.value == -1) {
      if (event.originalTarget.localName == "treecol")
      {
        // clicking on the name column in the folder pane should not sort
        event.stopPropagation();
      }
    }
    else if ((event.originalTarget.localName == "slider") ||
             (event.originalTarget.localName == "scrollbarbutton")) {
      event.stopPropagation();
    }
  }
}

function OpenMessageInNewTab(event)
{
  var bgLoad = gPrefBranch.getBoolPref("mail.tabs.loadInBackground");
  if (event.shiftKey)
    bgLoad = !bgLoad;

  document.getElementById("tabmail").openTab("message",
      {msgHdr: gFolderDisplay.selectedMessage,
       viewWrapperToClone: gFolderDisplay.view,
       background: bgLoad});
}

function ThreadTreeOnClick(event)
{
  var threadTree = document.getElementById("threadTree");

  // Middle click on a message opens the message in a tab
  if (event.button == 1 && event.originalTarget.localName != "slider" &&
      event.originalTarget.localName != "scrollbarbutton")
  {
    OpenMessageInNewTab(event);
    RestoreSelectionWithoutContentLoad(threadTree);
  }
}

function GetSelectedMsgFolders()
{
  return gFolderTreeView.getSelectedFolders();
}

function SelectFolder(folderUri)
{
  gFolderTreeView.selectFolder(GetMsgFolderFromUri(folderUri));
}

function ReloadMessage()
{
  gFolderDisplay.view.dbView.reloadMessage();
}

// Some of the per account junk mail settings have been
// converted to global prefs. Let's try to migrate some
// of those settings from the default account.
function MigrateJunkMailSettings()
{
  var junkMailSettingsVersion = gPrefBranch.getIntPref("mail.spam.version");
  if (!junkMailSettingsVersion)
  {
    // Get the default account, check to see if we have values for our
    // globally migrated prefs.
    var defaultAccount;
    try {
      defaultAccount = accountManager.defaultAccount;
    } catch (ex) {}
    if (defaultAccount && defaultAccount.incomingServer)
    {
      // we only care about
      var prefix = "mail.server." + defaultAccount.incomingServer.key + ".";
      if (gPrefBranch.prefHasUserValue(prefix + "manualMark"))
        gPrefBranch.setBoolPref("mail.spam.manualMark", pref.getBoolPref(prefix + "manualMark"));
      if (gPrefBranch.prefHasUserValue(prefix + "manualMarkMode"))
        gPrefBranch.setIntPref("mail.spam.manualMarkMode", pref.getIntPref(prefix + "manualMarkMode"));
      if (gPrefBranch.prefHasUserValue(prefix + "spamLoggingEnabled"))
        gPrefBranch.setBoolPref("mail.spam.logging.enabled", pref.getBoolPref(prefix + "spamLoggingEnabled"));
      if (gPrefBranch.prefHasUserValue(prefix + "markAsReadOnSpam"))
        gPrefBranch.setBoolPref("mail.spam.markAsReadOnSpam", pref.getBoolPref(prefix + "markAsReadOnSpam"));
    }
    // bump the version so we don't bother doing this again.
    gPrefBranch.setIntPref("mail.spam.version", 1);
  }
}

// The first time a user runs a build that supports folder views, pre-populate the favorite folders list
// with the existing INBOX folders.
function MigrateFolderViews()
{
  var folderViewsVersion = gPrefBranch.getIntPref("mail.folder.views.version");
  if (!folderViewsVersion)
  {
     var servers = accountManager.allServers;
     var server;
     var inbox;
     for (var index = 0; index < servers.Count(); index++)
     {
       server = servers.QueryElementAt(index, Components.interfaces.nsIMsgIncomingServer);
       if (server)
       {
         inbox = GetInboxFolder(server);
         if (inbox)
           inbox.setFlag(Components.interfaces.nsMsgFolderFlags.Favorite);
       }
     }
    gPrefBranch.setIntPref("mail.folder.views.version", 1);
  }
}

// Thunderbird has been storing old attachment download meta data in downloads.rdf
// even though there was no way to show or clean up this data. Now that we are using
// the new download manager in toolkit, we don't want to present this old data.
// To migrate to the new download manager, remove downloads.rdf.
function MigrateAttachmentDownloadStore()
{
  var attachmentStoreVersion = gPrefBranch.getIntPref("mail.attachment.store.version");
  if (!attachmentStoreVersion)
  {
    var dirService = Components.classes["@mozilla.org/file/directory_service;1"]
                     .getService(Components.interfaces.nsIProperties);
    var downloadsFile = dirService.get("DLoads", Components.interfaces.nsIFile);
    if (downloadsFile && downloadsFile.exists())
      downloadsFile.remove(false);

    // bump the version so we don't bother doing this again.
    gPrefBranch.setIntPref("mail.attachment.store.version", 1);
  }
}

// Do a one-time migration of the old mailnews.reuse_message_window pref to the
// newer mail.openMessageBehavior. This does the migration only if the old pref
// is defined.
function MigrateOpenMessageBehavior()
{
  let openMessageBehaviorVersion = gPrefBranch.getIntPref(
                                     "mail.openMessageBehavior.version");
  if (!openMessageBehaviorVersion)
  {
    let reuseMessageWindow;
    try {
      reuseMessageWindow = gPrefBranch.getBoolPref(
                             "mailnews.reuse_message_window");
    }
    catch (e) {}

    // Don't touch this if it isn't defined
    if (reuseMessageWindow === true)
      gPrefBranch.setIntPref("mail.openMessageBehavior",
          MailConsts.OpenMessageBehavior.EXISTING_WINDOW);
    else if (reuseMessageWindow === false)
      gPrefBranch.setIntPref("mail.openMessageBehavior",
          MailConsts.OpenMessageBehavior.NEW_TAB);

    gPrefBranch.setIntPref("mail.openMessageBehavior.version", 1);
  }
}

function ThreadPaneOnDragStart(aEvent) {
  if (aEvent.originalTarget.localName != "treechildren")
    return;

  let messages = gFolderDisplay.selectedMessageUris;
  if (!messages)
    return;

  gFolderDisplay.hintAboutToDeleteMessages();
  let ios = Components.classes["@mozilla.org/network/io-service;1"]
                      .getService(Components.interfaces.nsIIOService);
  let fileNames = [];
  let msgUrls = {};
  
  // dragging multiple messages to desktop does not
  // currently work, pending core fixes for
  // multiple-drop-on-desktop support. (bug 513464)
  for (let i in messages) {
    messenger.messageServiceFromURI(messages[i])
             .GetUrlForUri(messages[i], msgUrls, null);
    var subject = messenger.messageServiceFromURI(messages[i])
                           .messageURIToMsgHdr(messages[i]).mime2DecodedSubject;
    var uniqueFileName = suggestUniqueFileName(subject.substr(0,124), ".eml",
                                               fileNames);
    fileNames[i] = uniqueFileName;
    aEvent.dataTransfer.mozSetDataAt("text/x-moz-message", messages[i], i);
    aEvent.dataTransfer.mozSetDataAt("text/x-moz-url",msgUrls.value.spec, i);
    aEvent.dataTransfer.mozSetDataAt("application/x-moz-file-promise-url",
                                     msgUrls.value.spec + "&fileName=" + uniqueFileName,
                                     i);
    aEvent.dataTransfer.mozSetDataAt("application/x-moz-file-promise", null, i);
  }
  aEvent.dataTransfer.effectAllowed = "copyMove";
  aEvent.dataTransfer.addElement(aEvent.originalTarget);
}

/**
 * example use:
 *   suggestUniqueFileName("testname",".txt",["testname", "testname1"])
 *   returns "testname2"
 * does not check file system for existing files
 * @param existingNames array of names in use
 */
function suggestUniqueFileName(identifier, type, existingNames) {
  let suffix = 1;
  let suggestion;
  let base = identifier;
  let exists;
  do {
    exists = false;
    suggestion = GenerateValidFilename(base, type);
    for (let i = 0; i < existingNames.length; i++) {
      if (existingNames[i] == suggestion) {
        base = identifier + suffix;
        suffix++;
        exists = true;
        break;
      }
    }
  } while (exists);
  return suggestion;
}

function ThreadPaneOnDragOver(aEvent) {
  let ds = Components.classes["@mozilla.org/widget/dragservice;1"]
                     .getService(Components.interfaces.nsIDragService)
                     .getCurrentSession();
  ds.canDrop = false;
  if (!gFolderDisplay.displayedFolder.canFileMessages)
    return;

  let dt = aEvent.dataTransfer;
  if (Array.indexOf(dt.mozTypesAt(0), "application/x-moz-file") != -1) {
    let extFile = dt.mozGetDataAt("application/x-moz-file", 0)
                    .QueryInterface(Components.interfaces.nsIFile);
    if (extFile.isFile()) {
      let len = extFile.leafName.length;
      if (len > 4 && extFile.leafName.substr(len - 4).toLowerCase() == ".eml")
        ds.canDrop = true;
    }
  }
}

function ThreadPaneOnDrop(aEvent) {
  let dt = aEvent.dataTransfer;
  let cs = Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
                     .getService(Components.interfaces.nsIMsgCopyService);
  for (let i = 0; i < dt.mozItemCount; i++) {
    let extFile = dt.mozGetDataAt("application/x-moz-file", i)
                    .QueryInterface(Components.interfaces.nsIFile);
    if (extFile.isFile()) {
      let len = extFile.leafName.length;
      if (len > 4 && extFile.leafName.substr(len - 4).toLowerCase() == ".eml")
        cs.CopyFileMessage(extFile, gFolderDisplay.displayedFolder, null, false,
                           1, "", null, msgWindow);
    }
  }
}

