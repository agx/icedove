/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the phishing notification behaves properly.
 */

// make SOLO_TEST=message-header/test-phishing-bar.js mozmill-one

const MODULE_NAME = "test-phishing-bar";

const RELATIVE_ROOT = "../shared-modules";
const MODULE_REQUIRES = ["folder-display-helpers",
                         "window-helpers", "notificationbox-helpers"];

var os = {};
Components.utils.import('resource://mozmill/stdlib/os.js', os);

var folder;

const kBoxId = "msgNotificationBar";
const kNotificationValue = "maybeScam";

function setupModule(module) {
  for (let dep of MODULE_REQUIRES) {
    collector.getModule(dep).installInto(module);
  }

  folder = create_folder("PhishingBarA");
  add_message_to_folder(folder, create_message({body: {
    body: '<a href="http://www.evil.com/google/">http://www.google.com</a>',
    contentType: "text/html"
  }}));
  add_message_to_folder(folder, create_message());
  add_message_to_folder(folder, create_message({body: {
    body: 'check out http://130.128.4.1. and http://130.128.4.2/.',
    contentType: "text/plain"
  }}));
}

/**
 * Make sure the notification shows, and goes away once the Ignore menuitem
 * is clicked.
 */
function assert_ignore_works(aController) {
  wait_for_notification_to_show(aController, kBoxId, kNotificationValue);
  aController.click_menus_in_sequence(aController.e("phishingOptions"),
                                      [{id: "phishingOptionIgnore"}]);
  wait_for_notification_to_stop(aController, kBoxId, kNotificationValue);
}

/**
 * Test that when viewing a message, choosing ignore hides the the phishing
 * notification.
 */
function test_ignore_phishing_warning_from_message() {
  be_in_folder(folder);
  select_click_row(0);
  assert_ignore_works(mc);

  select_click_row(1);
  // msg 1 is normal -> no phishing warning
  assert_notification_displayed(mc, kBoxId, kNotificationValue, false);
  select_click_row(0);
  // msg 0 is a potential phishing attempt, but we ignored it so that should
  // be remembered
  assert_notification_displayed(mc, kBoxId, kNotificationValue, false);
}

/**
 * Test that when viewing en eml file, choosing ignore hides the phishing
 * notification.
 */
function test_ignore_phishing_warning_from_eml() {
  let thisFilePath = os.getFileForPath(__file__);
  let file = os.getFileForPath(os.abspath("./evil.eml", thisFilePath));

  let msgc = open_message_from_file(file);
  assert_ignore_works(msgc);
  close_window(msgc);
}

/**
 * Test that when viewing an attached eml file, the phishing notification works.
 */
function test_ignore_phishing_warning_from_eml_attachment() {
  let thisFilePath = os.getFileForPath(__file__);
  let file = os.getFileForPath(os.abspath("./evil-attached.eml", thisFilePath));

  let msgc = open_message_from_file(file);

  // Make sure the root message shows the phishing bar.
  wait_for_notification_to_show(msgc, kBoxId, kNotificationValue);

  // Open the attached message.
  plan_for_new_window("mail:messageWindow");
  msgc.e("attachmentList").getItemAtIndex(0).attachment.open();
  let msgc2 = wait_for_new_window("mail:messageWindow");
  wait_for_message_display_completion(msgc2, true);

  // Now make sure the attached message shows the phishing bar.
  wait_for_notification_to_show(msgc2, kBoxId, kNotificationValue);

  close_window(msgc2);
  close_window(msgc);
}

/**
 * Test that when viewing a message with an auto-linked ip address, we don't
 * get a warning. We'll have http://130.128.4.1 vs. http://130.128.4.1/
 */
function test_no_phishing_warning_for_ip_sameish_text() {
  be_in_folder(folder);
  select_click_row(2); // Mail with Public IP address.
  assert_notification_displayed(mc, kBoxId, kNotificationValue, false); // not shown
}


