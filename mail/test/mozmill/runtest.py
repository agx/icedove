#!/usr/bin/env python
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is Mail Bloat Test.
#
# The Initial Developer of the Original Code is
# Mozilla Messaging.
# Portions created by the Initial Developer are Copyright (C) 2008
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Mark Banner <bugzilla@standard8.plus.com>
#   Andrew Sutherland <bugzilla@asutherland.org>
#   Ludovic Hirlimann <ludovic@hirlimann.net>
#   Michael Foord <fuzzyman@voidspace.org.uk>
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

"""
Runs the Bloat test harness
"""

import sys
import os
import shutil
import mozrunner
import jsbridge
import mozmill
import socket
import copy
SCRIPT_DIRECTORY = os.path.abspath(os.path.realpath(os.path.dirname(sys.argv[0])))
sys.path.append(SCRIPT_DIRECTORY)
import automation
from time import sleep

# We need this because rmtree-ing read-only files fails on Windows
def rmtree_onerror(func, path, exc_info):
    """
    Error handler for ``shutil.rmtree``.

    If the error is due to an access error (read only file)
    it attempts to add write permission and then retries.

    If the error is for another reason it re-raises the error.
    
    Usage : ``shutil.rmtree(path, onerror=rmtree_onerror)``
    """
    import stat
    if not os.access(path, os.W_OK):
        # Is the error an access error ?
        os.chmod(path, stat.S_IWUSR)
        func(path)
    else:
        raise

class ThunderTestProfile(mozrunner.ThunderbirdProfile):
    preferences = {
        # say yes to debug output via dump
        'browser.dom.window.dump.enabled': True,
        # say no to slow script warnings
        'dom.max_chrome_script_run_time': 200,
        'dom.max_script_run_time': 0,
        # disable extension stuffs
        'extensions.update.enabled'    : False,
        'extensions.update.notifyUser' : False,
        # do not ask about being the default mail client
        'mail.shell.checkDefaultClient': False,
        # disable non-gloda indexing daemons
        'mail.winsearch.enable': False,
        'mail.winsearch.firstRunDone': True,
        'mail.spotlight.enable': False,
        'mail.spotlight.firstRunDone': True,
        # disable address books for undisclosed reasons
        'ldap_2.servers.osx.position': 0,
        'ldap_2.servers.oe.position': 0,
        # disable the first use junk dialog
        'mailnews.ui.junk.firstuse': False,
        # other unknown voodoo
        # -- dummied up local accounts to stop the account wizard
        'mail.account.account1.server' :  "server1",
        'mail.account.account2.identities' :  "id1",
        'mail.account.account2.server' :  "server2",
        'mail.accountmanager.accounts' :  "account1,account2",
        'mail.accountmanager.defaultaccount' :  "account2",
        'mail.accountmanager.localfoldersserver' :  "server1",
        'mail.identity.id1.fullName' :  "Tinderbox",
        'mail.identity.id1.smtpServer' :  "smtp1",
        'mail.identity.id1.useremail' :  "tinderbox@invalid.com",
        'mail.identity.id1.valid' :  True,
        'mail.root.none-rel' :  "[ProfD]Mail",
        'mail.root.pop3-rel' :  "[ProfD]Mail",
        'mail.server.server1.directory-rel' :  "[ProfD]Mail/Local Folders",
        'mail.server.server1.hostname' :  "Local Folders",
        'mail.server.server1.name' :  "Local Folders",
        'mail.server.server1.type' :  "none",
        'mail.server.server1.userName' :  "nobody",
        'mail.server.server2.check_new_mail' :  False,
        'mail.server.server2.directory-rel' :  "[ProfD]Mail/tinderbox",
        'mail.server.server2.download_on_biff' :  True,
        'mail.server.server2.hostname' :  "tinderbox",
        'mail.server.server2.login_at_startup' :  False,
        'mail.server.server2.name' :  "tinderbox@invalid.com",
        'mail.server.server2.type' :  "pop3",
        'mail.server.server2.userName' :  "tinderbox",
        'mail.smtp.defaultserver' :  "smtp1",
        'mail.smtpserver.smtp1.hostname' :  "tinderbox",
        'mail.smtpserver.smtp1.username' :  "tinderbox",
        'mail.smtpservers' :  "smtp1",
        'mail.startup.enabledMailCheckOnce' :  True,
        # Don't load what's new or the remote start page - keep everything local
        # under our control.
        'mailnews.start_page_override.mstone' :  "ignore",
        'mailnews.start_page.url': "about:blank",
        # Do not enable gloda
        'mailnews.database.global.indexer.enabled': False
        }

    def __init__(self, default_profile=None, profile=None, create_new=True,
                 plugins=[], preferences={}):
        self.init_env()
        self.profile_dir = os.path.join(SCRIPT_DIRECTORY, 'mozmillprofile')

        mozrunner.Profile.__init__(self, default_profile, profile, create_new, plugins, preferences)


    def init_env(self):
        self.base_env = dict(os.environ)
        # note, we do NOT want to set NO_EM_RESTART or jsbridge wouldn't work
        # avoid dialogs on windows
        self.base_env['XPCOM_DEBUG_BREAK'] = 'stack'
        # do not reuse an existing instance
        self.base_env['MOZ_NO_REMOTE'] = '1'

    def _run(self, *args, **extraenv):
        env = self.base_env.copy()
        env.update(extraenv)
        allArgs = [BINARY]
        allArgs.extend(args)
        proc = automation.Process(allArgs, env=env)
        status = proc.wait()

    def create_new_profile(self, default_profile):
        # create a clean directory
        if os.path.exists(self.profile_dir):
            shutil.rmtree(self.profile_dir, onerror=rmtree_onerror)
        os.makedirs(self.profile_dir)

        # explicitly create a profile in that directory
        self._run('-CreateProfile', 'test ' + self.profile_dir)
        return self.profile_dir

    def cleanup(self):
        '''
        Do not cleanup at all.  The next iteration will cleanup for us, but
        until that time it's useful for debugging failures to leave everything
        around.
        '''
        pass

class ThunderTestRunner(mozrunner.ThunderbirdRunner):

    def __init__(self, *args, **kwargs):
        self.profile = args[1]
        kwargs['env'] = self.profile.base_env
        mozrunner.Runner.__init__(self, *args, **kwargs)

    def find_binary(self):
        return self.profile.app_path


class ThunderTestCLI(mozmill.CLI):

    profile_class = ThunderTestProfile
    runner_class = ThunderTestRunner
    parser_options = copy.copy(mozmill.CLI.parser_options)
    parser_options[('-m', '--bloat-tests')] = {"default":None, "dest":"created_profile", "help":"Log file name."}

    def parse_and_get_runner(self):
        """Parses the command line arguments and returns a runner instance."""
        (options, args) = self.parser.parse_args()
        self.options = options
        self.args = args
        if self.options.plugins is None:
            plugins = []
        else:
            plugins = self.options.plugins.split(',')

        if self.options.test is not None:
            curdir = os.getcwd()
            localprofile = os.path.join(curdir, self.options.test, "profile")

            if os.path.isfile(localprofile):
                profilefile = open(localprofile, "r")
                nameinfile = profilefile.readline()
                default_profile = os.path.join(curdir, "profiles", nameinfile)
            else:
                default_profile = options.default_profile

        # We use a global as there appears to be no easy way of getting the
        # binary details into the profile without re-implementing what mozmill
        # gives us.
        global BINARY
        BINARY = self.options.binary
        print BINARY

        # We override profile in ThunderbirdTestProfile, so no point in setting
        # it here.
        profile = self.get_profile(default_profile, 
                                   None, True,
                                   plugins=plugins)
        runner = self.get_runner(binary=self.options.binary, 
                                 profile=profile)
        
        return runner


TEST_RESULTS = []
# override mozmill's default logging case, which I hate.
def logFailure(obj):
    FAILURE_LIST.append(obj)
def logEndTest(obj):
    TEST_RESULTS.append(obj)
#mozmill.LoggerListener.cases['mozmill.fail'] = logFailure
mozmill.LoggerListener.cases['mozmill.endTest'] = logEndTest

def prettifyFilename(path):
    lslash = path.rfind('/')
    if lslash != -1:
        return path[lslash+1:]
    else:
        return path

def prettyPrintException(e):
    print '  EXCEPTION:', e.get('message', 'no message!')
    print '    at:', prettifyFilename(e.get('fileName', 'nonesuch')), 'line', e.get('lineNumber', 0)
    if 'stack' in e:
        for line in e['stack'].splitlines():
            if not line:
                continue
            if line[0] == "(":
                funcname = None
            elif line[0] == "@":
                # this is probably the root, don't care
                continue
            else:
                funcname = line[:line.find('@')]
            pathAndLine = line[line.rfind('@')+1:]
            rcolon = pathAndLine.rfind(':')
            if rcolon != -1:
                path = pathAndLine[:rcolon]
                line = pathAndLine[rcolon+1:]
            else:
                path = pathAndLine
                line = 0
            if funcname:
                print '      ', funcname, prettifyFilename(path), line
            else:
                print '           ', prettifyFilename(path), line


import pprint
def prettyPrintResults():
    for result in TEST_RESULTS:
        #pprint.pprint(result)
        if len(result['fails']) == 0:
            print 'TEST-PASS | ', result['name']
        else:
            print 'TEST-UNEXPECTED-FAIL | ', result['name']
        for failure in result['fails']:
            if 'exception' in failure:
                prettyPrintException(failure['exception'])

import atexit
atexit.register(prettyPrintResults)

if __name__ == '__main__':
    ThunderTestCLI().run()
