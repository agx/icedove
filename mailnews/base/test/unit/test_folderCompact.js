/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

 /*
  * Test suite for folder compaction
  *
  * Currently tested:
  * - Compacting local folders
  * TODO
  * - Compacting imap offline stores.
  */

Components.utils.import("resource:///modules/mailServices.js");

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/berkeleystore;1");

// Globals
var gMsgFile1, gMsgFile2, gMsgFile3;
var gLocalFolder2;
var gLocalFolder3;
var gLocalTrashFolder;
var gCurTestNum;
// After a compact (or other operation), this is what we expect the 
// folder size to be.
var gExpectedFolderSize;
var gMsgHdrs = new Array();
var gExpectedInboxSize;
var gExpectedFolder2Size;
var gExpectedFolder3Size;

// Transfer message keys between function calls.
var gMsgKeys = [];

// nsIMsgCopyServiceListener implementation
var copyListener = 
{
  OnStartCopy: function() {},
  OnProgress: function(aProgress, aProgressMax) {},
  SetMessageKey: function(aKey)
  {
    let hdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
    gMsgHdrs.push({hdr: hdr, ID: hdr.messageId});
  },
  SetMessageId: function(aMessageId) {},
  OnStopCopy: function(aStatus)
  {
    // Check: message successfully copied.
    do_check_eq(aStatus, 0);
    // Ugly hack: make sure we don't get stuck in a JS->C++->JS->C++... call stack
    // This can happen with a bunch of synchronous functions grouped together, and
    // can even cause tests to fail because they're still waiting for the listener
    // to return
    do_timeout(0, function(){doTest(++gCurTestNum);});
  }
};

var urlListener =
{
  OnStartRunningUrl: function (aUrl) {
  },
  OnStopRunningUrl: function (aUrl, aExitCode) {
    // Check: message successfully copied.
    do_check_eq(aExitCode, 0);

    if (gMsgKeys.length > 0) {
      // Bug 854798: Check if the new message keys are the same as before compaction.
      let folderMsgs = gMsgKeys.folder.messages;
      // First message was deleted so skip it in the old array.
      for (let i = 1; i < gMsgKeys.length; i++) {
        do_check_true(folderMsgs.hasMoreElements());
        let header = folderMsgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
        do_check_eq(header.messageKey, gMsgKeys[i]);
      }
      do_check_false(folderMsgs.hasMoreElements());
      gMsgKeys.length = 0;
    }
    // Ugly hack: make sure we don't get stuck in a JS->C++->JS->C++... call stack
    // This can happen with a bunch of synchronous functions grouped together, and
    // can even cause tests to fail because they're still waiting for the listener
    // to return
    do_timeout(0, function(){doTest(++gCurTestNum);});
  }
};

function copyFileMessage(file, destFolder, isDraftOrTemplate)
{
  MailServices.copy.CopyFileMessage(file, destFolder, null, isDraftOrTemplate, 0, "", copyListener, null);
}

function copyMessages(items, isMove, srcFolder, destFolder)
{
  var array = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  items.forEach(function (item) {
    array.appendElement(item, false);
  });
  MailServices.copy.CopyMessages(srcFolder, array, destFolder, isMove, copyListener, null, true);
}

function deleteMessages(srcFolder, items)
{
  var array = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  items.forEach(function (item) {
    array.appendElement(item, false);
  });
  
  srcFolder.deleteMessages(array, null, false, true, copyListener, true);
}

function calculateFolderSize(folder)
{
  let msgDB = folder.msgDatabase;
  let enumerator = msgDB.EnumerateMessages();
  let totalSize = 0;
  if (enumerator)
  {
    while (enumerator.hasMoreElements())
    {
      var header = enumerator.getNext();
      if (header instanceof Components.interfaces.nsIMsgDBHdr)
        totalSize += header.messageSize;
    }
  }
  return totalSize;
}

function verifyMsgOffsets(folder)
{
  let msgDB = folder.msgDatabase;
  let enumerator = msgDB.EnumerateMessages();
  if (enumerator)
  {
    while (enumerator.hasMoreElements())
    {
      let header = enumerator.getNext();
      if (header instanceof Components.interfaces.nsIMsgDBHdr) {
        let storeToken = header.getStringProperty("storeToken");
        do_check_eq(storeToken, header.messageOffset);
      }
    }
  }
}

/*
 * TESTS
 */

// Beware before commenting out a test -- later tests might just depend on earlier ones
var gTestArray =
[
  // Copying messages from files
  function testCopyFileMessage1() {
    copyFileMessage(gMsgFile1, localAccountUtils.inboxFolder, false);
  },
  function testCopyFileMessage2() {
    copyFileMessage(gMsgFile2, localAccountUtils.inboxFolder, false);
  },
  function testCopyFileMessage3() {
    copyFileMessage(gMsgFile3, localAccountUtils.inboxFolder, true);
  },

  // Moving/copying messages
  function testCopyMessages1() {
    copyMessages([gMsgHdrs[0].hdr], false, localAccountUtils.inboxFolder, gLocalFolder2);
  },
  function testCopyMessages2() {
    copyMessages([gMsgHdrs[1].hdr, gMsgHdrs[2].hdr], false, localAccountUtils.inboxFolder, gLocalFolder2);
  },
  function testMoveMessages1() {
    copyMessages([gMsgHdrs[0].hdr, gMsgHdrs[1].hdr], true, localAccountUtils.inboxFolder, gLocalFolder3);
  },

  // Deleting messages
  function testDeleteMessages1() { // delete to trash
    // Let's take a moment to re-initialize stuff that got moved
    var folder3DB = gLocalFolder3.msgDatabase;
    gMsgHdrs[0].hdr = folder3DB.getMsgHdrForMessageID(gMsgHdrs[0].ID);

    // Store message keys before deletion and compaction.
    gMsgKeys.folder = gLocalFolder3;
    let folderMsgs = gLocalFolder3.messages;
    while (folderMsgs.hasMoreElements()) {
      let header = folderMsgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      gMsgKeys.push(header.messageKey);
    }

    // Now delete the message
    deleteMessages(gLocalFolder3, [gMsgHdrs[0].hdr], false, false);
  },
  function compactFolder()
  {
    gExpectedFolderSize = calculateFolderSize(gLocalFolder3);
    do_check_neq(gLocalFolder3.expungedBytes, 0);
    gLocalFolder3.compact(urlListener, null);
  },
  function testDeleteMessages2() {
    do_check_eq(gExpectedFolderSize, gLocalFolder3.filePath.fileSize);
    verifyMsgOffsets(gLocalFolder3);
    var folder2DB = gLocalFolder2.msgDatabase;
    gMsgHdrs[0].hdr = folder2DB.getMsgHdrForMessageID(gMsgHdrs[0].ID);

    // Store message keys before deletion and compaction.
    gMsgKeys.folder = gLocalFolder2;
    let folderMsgs = gLocalFolder2.messages;
    while (folderMsgs.hasMoreElements()) {
      let header = folderMsgs.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      gMsgKeys.push(header.messageKey);
    }

    // Now delete the message
    deleteMessages(gLocalFolder2, [gMsgHdrs[0].hdr], false, false);
  },
  function compactAllFolders()
  {
    gExpectedInboxSize = calculateFolderSize(localAccountUtils.inboxFolder);
    gExpectedFolder2Size = calculateFolderSize(gLocalFolder2);
    gExpectedFolder3Size = calculateFolderSize(gLocalFolder3);
    // force expunged bytes count to get cached.
    let localFolder2ExpungedBytes = gLocalFolder2.expungedBytes;
    // mark localFolder2 as having an invalid db, and remove it
    // for good measure.
    gLocalFolder2.msgDatabase.summaryValid = false;
    gLocalFolder2.msgDatabase = null;
    gLocalFolder2.ForceDBClosed();
    let dbPath = gLocalFolder2.filePath;
    dbPath.leafName = dbPath.leafName + ".msf";
    dbPath.remove(false);
    localAccountUtils.inboxFolder.compactAll(urlListener, null, true);
  },
  function lastTestCheck()
  {
    do_check_eq(gExpectedInboxSize, localAccountUtils.inboxFolder.filePath.fileSize);
    do_check_eq(gExpectedFolder2Size, gLocalFolder2.filePath.fileSize);
    do_check_eq(gExpectedFolder3Size, gLocalFolder3.filePath.fileSize);
    verifyMsgOffsets(gLocalFolder2);
    verifyMsgOffsets(gLocalFolder3);
    verifyMsgOffsets(localAccountUtils.inboxFolder);
    urlListener.OnStopRunningUrl(null, 0);
  }
];

function run_test()
{
  localAccountUtils.loadLocalMailAccount();
  // Load up some messages so that we can copy them in later.
  gMsgFile1 = do_get_file("../../../data/bugmail10");
  gMsgFile2 = do_get_file("../../../data/bugmail11");
  gMsgFile3 = do_get_file("../../../data/draft1");

  // Create another folder to move and copy messages around, and force initialization.
  gLocalFolder2 = localAccountUtils.rootFolder.createLocalSubfolder("folder2");
  let folderName = gLocalFolder2.prettiestName;
  // Create a third folder for more testing.
  gLocalFolder3 = localAccountUtils.rootFolder.createLocalSubfolder("folder3");
  folderName = gLocalFolder3.prettiestName;

  // "Master" do_test_pending(), paired with a do_test_finished() at the end of all the operations.
  do_test_pending();

//  do_test_finished();
  // Do the test.
  doTest(1);
}

function doTest(test)
{
  if (test <= gTestArray.length)
  {
    gCurTestNum = test;
    var testFn = gTestArray[test-1];
    // Set a limit of 10 seconds; if the notifications haven't arrived by
    // then, there's a problem.
    do_timeout(10000, function() {
      if (gCurTestNum == test)
        do_throw("Notifications not received in 10000 ms for operation " + testFn.name);
    });
    try {
    testFn();
    } catch(ex) {dump(ex);}
  }
  else
  {
    do_test_finished(); // for the one in run_test()
  }
}
