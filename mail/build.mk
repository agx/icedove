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
# The Original Code is the Mozilla build system.
#
# The Initial Developer of the Original Code is
# the Mozilla Foundation <http://www.mozilla.org/>.
# Portions created by the Initial Developer are Copyright (C) 2006
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Benjamin Smedberg <benjamin@smedbergs.us> (Initial Code)
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

ifndef COMM_BUILD # Mozilla Makefile

ifndef LIBXUL_SDK
include $(topsrcdir)/toolkit/toolkit-tiers.mk
endif

TIERS += app

ifdef MOZ_EXTENSIONS
tier_app_dirs += extensions
endif

else # toplevel Makefile

TIERS += app

ifdef MOZ_LDAP_XPCOM
tier_app_staticdirs += directory/c-sdk
tier_app_dirs += directory/xpcom
endif

ifdef MOZ_COMPOSER
tier_app_dirs += editor/ui
endif

ifdef MOZ_BRANDING_DIRECTORY
tier_app_dirs += $(MOZ_BRANDING_DIRECTORY)
else
tier_app_dirs += mail/branding/nightly
endif

tier_app_dirs += \
	mailnews/base \
	mailnews \
	$(NULL)

ifdef MOZ_CALENDAR
tier_app_dirs += calendar/lightning
endif

tier_app_dirs += \
	mail \
	$(NULL)

endif # COMM_BUILD

installer:
	@$(MAKE) -C mail/installer installer

package:
	@$(MAKE) -C mail/installer

package-compare:
	@$(MAKE) -C mail/installer package-compare

install::
	@$(MAKE) -C mail/installer install

source-package::
	@$(MAKE) -C mail/installer source-package

upload::
	@$(MAKE) -C mail/installer upload

ifdef ENABLE_TESTS
# Instructions below this line are for mail/ specific tests.

MOZMILLDIR=$(DEPTH)/mozilla/_tests/mozmill

ifneq (,$(filter mac cocoa,$(MOZ_WIDGET_TOOLKIT)))
# Mac options
APP_NAME = $(MOZ_APP_DISPLAYNAME)
ifdef MOZ_DEBUG
APP_NAME := $(APP_NAME)Debug
endif
PROGRAM_LOCATION = ../../../$(DIST)/$(APP_NAME).app/Contents/MacOS/
PROGRAM = $(PROGRAM_LOCATION)thunderbird-bin$(BIN_SUFFIX)
else
# Non-mac options
PROGRAM_LOCATION = ../../../$(DIST)/bin/
PROGRAM = $(PROGRAM_LOCATION)thunderbird$(BIN_SUFFIX)
endif

mozmill::
	cd $(MOZMILLDIR) && MACOSX_DEPLOYMENT_TARGET= $(PYTHON) \
	runtestlist.py --list=mozmilltests.list --binary=$(PROGRAM) \
	--dir=$(topsrcdir)/mail/test/mozmill \
	--default-profile=$(PROGRAM_LOCATION)/defaults/profile $(MOZMILL_EXTRA)

mozmill-one::
	cd $(MOZMILLDIR) && MACOSX_DEPLOYMENT_TARGET= $(PYTHON) runtest.py \
	--test=$(topsrcdir)/mail/test/mozmill/$(SOLO_TEST) --binary=$(PROGRAM) \
	--default-profile=$(PROGRAM_LOCATION)/defaults/profile $(MOZMILL_EXTRA)
endif
