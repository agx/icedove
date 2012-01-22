/* ***** BEGIN LICENSE BLOCK *****
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
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Jie Zhang <jzhang918@gmail.com>
 *   Blake Winton <bwinton@latte.ca>
 *   Jim Porter <squibblyflabbetydoo@gmail.com>
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

/**
 * Checks various attachments display correctly
 */

var MODULE_NAME = 'test-attachment';

var RELATIVE_ROOT = '../shared-modules';
var MODULE_REQUIRES = ['folder-display-helpers', 'compose-helpers',
                       'window-helpers'];

var elib = {};
Cu.import('resource://mozmill/modules/elementslib.js', elib);
var EventUtils = {};
Cu.import('resource://mozmill/stdlib/EventUtils.js', EventUtils);


var folder;

const textAttachment =
  "One of these days... people like me will rise up and overthrow you, and " +
  "the end of tyranny by the homeostatic machine will have arrived. The day " +
  "of human values and compassion and simple warmth will return, and when " +
  "that happens someone like myself who has gone through an ordeal and who " +
  "genuinely needs hot coffee to pick him up and keep him functioning when " +
  "he has to function will get the hot coffee whether he happens to have a " +
  "poscred readily available or not.";

const binaryAttachment = textAttachment;

var setupModule = function (module) {
  let fdh = collector.getModule('folder-display-helpers');
  fdh.installInto(module);
  let wh = collector.getModule('window-helpers');
  wh.installInto(module);
  let composeHelper = collector.getModule('compose-helpers');
  composeHelper.installInto(module);
  let wh = collector.getModule('window-helpers');
  wh.installInto(module);

  folder = create_folder("AttachmentA");

  // create some messages that have various types of attachments
  messages = [
    // no attachment
    {},
    // text attachment
    { attachments: [{ body: textAttachment,
                      filename: 'ubik.txt',
                      format: '' }],
    },
    // binary attachment; filename has 9 "1"s, which should be just within the
    // limit for showing the original name
    { attachments: [{ body: binaryAttachment,
                      contentType: 'application/octet-stream',
                      filename: 'ubik-111111111.xxyyzz',
                      format: '' }],
    },
    // multiple attachments
    { attachments: [{ body: textAttachment,
                      filename: 'ubik.txt',
                      format: '' },
                    { body: binaryAttachment,
                      contentType: 'application/octet-stream',
                      filename: 'ubik.xxyyzz',
                      format: '' }],
    },
    // evilly-named attachment; spaces should be collapsed and trimmed on the
    // ends
    { attachments: [{ body: textAttachment,
                      contentType: 'application/octet-stream',
                      filename: ' ubik  .txt                            .evil ',
                      sanitizedFilename: 'ubik .txt .evil',
                      format: '' }],
    },
    // another evilly-named attachment; filename has 10 "_"s, which should be
    // just enough to trigger the sanitizer
    { attachments: [{ body: textAttachment,
                      contentType: 'application/octet-stream',
                      filename: 'ubik.txt__________.evil',
                      sanitizedFilename: 'ubik.txt_…_.evil',
                      format: '' }],
    },
  ];

  // Add another evilly-named attachment for Windows tests, to ensure that
  // trailing periods are stripped.
  if ('@mozilla.org/windows-registry-key;1' in Components.classes) {
    messages.push({ attachments: [{ body: textAttachment,
                                    contentType: 'application/octet-stream',
                                    filename: 'ubik.evil. . . . . . . . . ....',
                                    sanitizedFilename: 'ubik.evil',
                                    format: '' }],
                  });
  }

  for (let i = 0; i < messages.length; i++)
    add_message_to_folder(folder, create_message(messages[i]));
};

function test_attachment_view_collapsed() {
  be_in_folder(folder);

  select_click_row(0);
  assert_selected_and_displayed(0);

  if (!mc.e("attachmentView").collapsed)
    throw new Error("Attachment pane expanded when it shouldn't be!");
}

function test_attachment_view_expanded() {
  be_in_folder(folder);

  for (let i = 1; i < messages.length; i++) {
    select_click_row(i);
    assert_selected_and_displayed(i);

    if (mc.e("attachmentView").collapsed)
      throw new Error("Attachment pane collapsed (on message #"+i+
                      " when it shouldn't be!");
  }
}

function test_attachment_name_sanitization() {
  be_in_folder(folder);

  let attachmentList = mc.e("attachmentList");

  for (let i = 0; i < messages.length; i++) {
    if ("attachments" in messages[i]) {
      select_click_row(i);
      assert_selected_and_displayed(i);

      let attachments = messages[i].attachments;
      if (messages[i].attachments.length == 1)
        assert_equals(mc.e("attachmentName").value,
                      attachments[0].sanitizedFilename ||
                      attachments[0].filename);

      for (let j = 0; j < attachments.length; j++)
        assert_equals(attachmentList.getItemAtIndex(j).getAttribute("name"),
                      attachments[j].sanitizedFilename ||
                      attachments[j].filename);
    }
  }
}

function test_attachment_name_click() {
  be_in_folder(folder);

  select_click_row(1);
  assert_selected_and_displayed(1);

  // Ensure the context menu appears when right-clicking the attachment name
  mc.rightClick(mc.eid("attachmentName"));
  wait_for_popup_to_open(mc.e("attachmentItemContext"));
  close_popup(mc, mc.eid("attachmentItemContext"));
}

function test_attachment_list_expansion() {
  be_in_folder(folder);

  select_click_row(1);
  assert_selected_and_displayed(1);

  let attachmentList = mc.e("attachmentList");
  let attachmentToggle = mc.eid("attachmentToggle");
  let attachmentBar = mc.eid("attachmentBar");

  assert_true(attachmentList.collapsed, "Attachment list should start out " +
              "collapsed!");

  mc.click(attachmentToggle);
  assert_true(!attachmentList.collapsed, "Attachment list should be expanded " +
              "after clicking twisty!");
  assert_attachment_list_focused();

  mc.click(attachmentToggle);
  assert_true(attachmentList.collapsed, "Attachment list should be collapsed " +
              "after clicking twisty again!");
  assert_message_pane_focused();

  mc.click(attachmentBar);
  assert_true(!attachmentList.collapsed, "Attachment list should be expanded " +
              "after clicking bar!");
  assert_attachment_list_focused();

  mc.click(attachmentBar);
  assert_true(attachmentList.collapsed, "Attachment list should be collapsed " +
              "after clicking bar again!");
  assert_message_pane_focused();
}

function test_selected_attachments_are_cleared() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_click_row(3);

  // Expand the attachment list.
  mc.click(mc.eid("attachmentToggle"));

  // Select both the attachments.
  let attachmentList = mc.e("attachmentList");
  assert_equals(attachmentList.selectedItems.length, 0,
                "We had selected items on first load, when we shouldn't have!");

  // We can just click on the first element, but the second one needs a
  // ctrl-click (or cmd-click for those Mac-heads among us).
  mc.click(new elib.Elem(attachmentList.children[0]), 5, 5);
  EventUtils.synthesizeMouse(attachmentList.children[1], 5, 5,
                             {accelKey: true}, mc.window);

  assert_equals(attachmentList.selectedItems.length, 2,
                "We had the wrong number of selected items after selecting some!");

  // Switch to the message with one attachment, and make sure there are no
  // selected attachments.
  select_click_row(2);

  // Expand the attachment list again.
  mc.click(mc.eid("attachmentToggle"));

  assert_equals(attachmentList.selectedItems.length, 0,
                "We had selected items after loading a new message!");
}

function test_attachment_toolbar_customize() {
  // This tests that removing the "save all" button from the attachment bar
  // works correctly (i.e. it doesn't throw an error in the middle of processing
  // the attachments when loading a later message).
  be_in_folder(folder);

  // First, select the message with one attachment.
  select_click_row(2);

  remove_from_toolbar(mc.e("attachment-view-toolbar"), "attachmentSaveAll");

  // Now, select the message with two attachments and ensure that no errors
  // are thrown.
  select_click_row(3);

  // Since we are viewing a message with two attachments, the attachment name
  // element should be hidden. If not, we hit an error!
  assert_true(mc.e("attachmentName").hidden,
              "Attachment name should have been hidden!");

  // Also, make sure that the save all button is, in fact, not on the toolbar.
  // Otherwise, we didn't actually trigger the bug.
  assert_equals(mc.e("attachmentSaveAllSingle"), null,
                "'save' button should be null!");
  assert_equals(mc.e("attachmentSaveAllMultiple"), null,
                "'save all' button should be null!");

  // Finally, restore the save all button, just to be polite.
  add_to_toolbar(mc.e("attachment-view-toolbar"), "attachmentSaveAll");
}

function test_select_all_attachments_key() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_none();
  select_click_row(3);

  // Expand the attachment list.
  mc.click(mc.eid("attachmentToggle"));

  let attachmentList = mc.e("attachmentList");
  mc.keypress(new elib.Elem(attachmentList), "a", {accelKey: true});
  assert_equals(attachmentList.selectedItems.length, 2,
                "Should have selected all attachments!");
}

function test_delete_attachment_key() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_none();
  select_click_row(3);

  // Expand the attachment list.
  mc.click(mc.eid("attachmentToggle"));

  let firstAttachment = new elib.Elem(mc.e("attachmentList").firstChild);
  mc.click(firstAttachment, 5, 5);

  // Try deleting with the delete key
  plan_for_modal_dialog("commonDialog", function(cdc) {
    cdc.window.document.documentElement.cancelDialog();
  });
  mc.keypress(firstAttachment, "VK_DELETE", {});
  wait_for_modal_dialog("commonDialog");

  // Try deleting with the shift-delete key combo.
  plan_for_modal_dialog("commonDialog", function(cdc) {
    cdc.window.document.documentElement.cancelDialog();
  });
  mc.keypress(firstAttachment, "VK_DELETE", {shiftKey: true});
  wait_for_modal_dialog("commonDialog");
}

function test_attachments_compose_menu() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_none();
  select_click_row(3);

  let cwc = open_compose_with_forward();
  let attachment = cwc.e("attachmentBucket");

  // Focus the attachmentBucket
  attachment.focus();
  assert_equals(cwc.e("cmd_delete").getAttribute("label"), "Remove Attachments",
                "attachmentBucket is focused!");

  // Select 1 attachment, and
  // focus the subject to see the label change and to execute isCommandEnabled
  cwc.click(new elib.Elem(attachment.children[0]));
  cwc.e("msgSubject").focus();
  assert_equals(cwc.e("cmd_delete").getAttribute("label"), "Delete",
                "attachmentBucket is not focused!");

  // Focus back to the attachmentBucket
  attachment.focus();
  assert_equals(cwc.e("cmd_delete").getAttribute("label"), "Remove Attachment",
                "Only 1 attachment is selected!");

  // Select 2 attachments, and focus the identity for the same purpose
  attachment.focus();
  cwc.click(new elib.Elem(attachment.children[1]));
  EventUtils.synthesizeMouse(attachment.children[0], 0, 0,
                             {accelKey: true}, cwc.window);
  cwc.e("msgIdentity").focus();
  assert_equals(cwc.e("cmd_delete").getAttribute("label"), "Delete",
                "attachmentBucket is not focused!");

  // Focus back to the attachmentBucket
  attachment.focus();
  assert_equals(cwc.e("cmd_delete").getAttribute("label"), "Remove Attachments",
                "Multiple attachments are selected!");

  close_compose_window(cwc);
}

function test_delete_from_toolbar() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_none();
  select_click_row(3);

  // Expand the attachment list.
  mc.click(mc.eid("attachmentToggle"));

  let firstAttachment = new elib.Elem(mc.e("attachmentList").firstChild);
  mc.click(firstAttachment, 5, 5);

  // Make sure clicking the "Delete" toolbar button with an attachment focused
  // deletes the *message*.
  plan_to_wait_for_folder_events("DeleteOrMoveMsgCompleted");
  mc.click(mc.eid("hdrTrashButton"));
  wait_for_folder_events();
}
