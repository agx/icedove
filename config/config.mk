#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

#
# config.mk
#
# Determines the platform and builds the macros needed to load the
# appropriate platform-specific .mk file, then defines all (most?)
# of the generic macros.
#

# Define an include-at-most-once flag
ifdef INCLUDED_CONFIG_MK
$(error Do not include config.mk twice!)
endif
INCLUDED_CONFIG_MK = 1

EXIT_ON_ERROR = set -e; # Shell loops continue past errors without this.

ifndef topsrcdir
topsrcdir	= $(DEPTH)
endif

ifndef INCLUDED_AUTOCONF_MK
include $(DEPTH)/config/autoconf.mk
endif

-include $(DEPTH)/.mozconfig.mk

# Integrate with mozbuild-generated make files. We first verify that no
# variables provided by the automatically generated .mk files are
# present. If they are, this is a violation of the separation of
# responsibility between Makefile.in and mozbuild files.
_MOZBUILD_EXTERNAL_VARIABLES := \
  ANDROID_GENERATED_RESFILES \
  ANDROID_RESFILES \
  CMMSRCS \
  CPP_UNIT_TESTS \
  DIRS \
  DIST_SUBDIR \
  EXTRA_DSO_LDOPTS \
  EXTRA_JS_MODULES \
  EXTRA_PP_COMPONENTS \
  EXTRA_PP_JS_MODULES \
  FINAL_LIBRARY \
  FINAL_TARGET \
  GTEST_CMMSRCS \
  GTEST_CPPSRCS \
  GTEST_CSRCS \
  HOST_CSRCS \
  HOST_LIBRARY_NAME \
  IS_COMPONENT \
  JAR_MANIFEST \
  LIBRARY_NAME \
  LIBS \
  LIBXUL_LIBRARY \
  MAKE_FRAMEWORK \
  MODULE \
  MSVC_ENABLE_PGO \
  NO_DIST_INSTALL \
  PARALLEL_DIRS \
  SDK_HEADERS \
  SDK_LIBRARY \
  SHARED_LIBRARY_LIBS \
  SHARED_LIBRARY_NAME \
  SIMPLE_PROGRAMS \
  STATIC_LIBRARY_NAME \
  TEST_DIRS \
  TESTING_JS_MODULES \
  TESTING_JS_MODULE_DIR \
  TIERS \
  TOOL_DIRS \
  XPCSHELL_TESTS \
  XPIDL_MODULE \
  XPI_NAME \
  $(NULL)

_DEPRECATED_VARIABLES := \
  MOCHITEST_FILES_PARTS \
  MOCHITEST_BROWSER_FILES_PARTS \
  $(NULL)

ifndef EXTERNALLY_MANAGED_MAKE_FILE
# Using $(firstword) may not be perfect. But it should be good enough for most
# scenarios.
_current_makefile = $(CURDIR)/$(firstword $(MAKEFILE_LIST))

$(foreach var,$(_MOZBUILD_EXTERNAL_VARIABLES),$(if $(filter file override,$(subst $(NULL) ,_,$(origin $(var)))),\
    $(error Variable $(var) is defined in $(_current_makefile). It should only be defined in moz.build files),\
    ))

$(foreach var,$(_DEPRECATED_VARIABLES),$(if $(filter file override,$(subst $(NULL) ,_,$(origin $(var)))),\
    $(error Variable $(var) is defined in $(_current_makefile). This variable has been deprecated. It does nothing. It must be removed in order to build)\
    ))

# Import the automatically generated backend file. If this file doesn't exist,
# the backend hasn't been properly configured. We want this to be a fatal
# error, hence not using "-include".
ifndef STANDALONE_MAKEFILE
GLOBAL_DEPS += backend.mk
include backend.mk
endif

# Freeze the values specified by moz.build to catch them if they fail.

$(foreach var,$(_MOZBUILD_EXTERNAL_VARIABLES),$(eval $(var)_FROZEN := '$($(var))'))
$(foreach var,$(_DEPRECATED_VARIABLES),$(eval $(var)_FROZEN := '$($(var))'))

CHECK_MOZBUILD_VARIABLES = $(foreach var,$(_MOZBUILD_EXTERNAL_VARIABLES), \
  $(if $(subst $($(var)_FROZEN),,'$($(var))'), \
	  $(error Variable $(var) is defined in $(_current_makefile). It should only be defined in moz.build files),\
  )) $(foreach var,$(_DEPRECATED_VARIABLES), \
	$(if $(subst $($(var)_FROZEN),,'$($(var))'), \
    $(error Variable $(var) is defined in $(_current_makefile). This variable has been deprecated. It does nothing. It must be removed in order to build),\
    ))

endif

space = $(NULL) $(NULL)

# Include defs.mk files that can be found in $(srcdir)/$(DEPTH),
# $(srcdir)/$(DEPTH-1), $(srcdir)/$(DEPTH-2), etc., and $(srcdir)
# where $(DEPTH-1) is one level less of depth, $(DEPTH-2), two, etc.
# i.e. for DEPTH=../../.., DEPTH-1 is ../.. and DEPTH-2 is ..
# These defs.mk files are used to define variables in a directory
# and all its subdirectories, recursively.
__depth := $(subst /, ,$(DEPTH))
ifeq (.,$(__depth))
__depth :=
endif
$(foreach __d,$(__depth) .,$(eval __depth = $(wordlist 2,$(words $(__depth)),$(__depth))$(eval -include $(subst $(space),/,$(strip $(srcdir) $(__depth) defs.mk)))))

COMMA = ,

# Sanity check some variables
CHECK_VARS := \
 XPI_NAME \
 LIBRARY_NAME \
 MODULE \
 DEPTH \
 SHORT_LIBNAME \
 XPI_PKGNAME \
 INSTALL_EXTENSION_ID \
 SHARED_LIBRARY_NAME \
 STATIC_LIBRARY_NAME \
 $(NULL)

# checks for internal spaces or trailing spaces in the variable
# named by $x
check-variable = $(if $(filter-out 0 1,$(words $($(x))z)),$(error Spaces are not allowed in $(x)))

$(foreach x,$(CHECK_VARS),$(check-variable))

RM = rm -f

ifndef INCLUDED_FUNCTIONS_MK
include $(MOZILLA_SRCDIR)/config/makefiles/functions.mk
endif

# FINAL_TARGET specifies the location into which we copy end-user-shipped
# build products (typelibs, components, chrome). It may already be specified by
# a moz.build file.
#
# If XPI_NAME is set, the files will be shipped to $(DIST)/xpi-stage/$(XPI_NAME)
# instead of $(DIST)/bin. In both cases, if DIST_SUBDIR is set, the files will be
# shipped to a $(DIST_SUBDIR) subdirectory.
FINAL_TARGET ?= $(if $(XPI_NAME),$(DIST)/xpi-stage/$(XPI_NAME),$(DIST)/bin)$(DIST_SUBDIR:%=/%)
# Override the stored value for the check to make sure that the variable is not
# redefined in the Makefile.in value.
FINAL_TARGET_FROZEN := '$(FINAL_TARGET)'

ifdef XPI_NAME
DEFINES += -DXPI_NAME=$(XPI_NAME)
endif

# The VERSION_NUMBER is suffixed onto the end of the DLLs we ship.
VERSION_NUMBER		= 50

ifeq ($(HOST_OS_ARCH),WINNT)
win_srcdir      := $(subst $(topsrcdir),$(WIN_TOP_SRC),$(srcdir))
BUILD_TOOLS     = $(WIN_TOP_SRC)/mozilla/build/unix
else
win_srcdir      := $(srcdir)
BUILD_TOOLS     = $(MOZILLA_SRCDIR)/build/unix
endif

CONFIG_TOOLS	= $(MOZ_BUILD_ROOT)/config
AUTOCONF_TOOLS	= $(MOZILLA_SRCDIR)/build/autoconf

#
# Strip off the excessively long version numbers on these platforms,
# but save the version to allow multiple versions of the same base
# platform to be built in the same tree.
#
ifneq (,$(filter FreeBSD HP-UX Linux NetBSD OpenBSD SunOS,$(OS_ARCH)))
OS_RELEASE	:= $(basename $(OS_RELEASE))

# Allow the user to ignore the OS_VERSION, which is usually irrelevant.
ifdef WANT_MOZILLA_CONFIG_OS_VERSION
OS_VERS		:= $(suffix $(OS_RELEASE))
OS_VERSION	:= $(shell echo $(OS_VERS) | sed 's/-.*//')
endif

endif

OS_CONFIG	:= $(OS_ARCH)$(OS_RELEASE)

FINAL_LINK_LIBS = $(MOZDEPTH)/config/final-link-libs
FINAL_LINK_COMPS = $(MOZDEPTH)/config/final-link-comps
FINAL_LINK_COMP_NAMES = $(MOZDEPTH)/config/final-link-comp-names

ifdef _MSC_VER
CC_WRAPPER ?= $(call py_action,cl)
CXX_WRAPPER ?= $(call py_action,cl)
endif # _MSC_VER

CC := $(CC_WRAPPER) $(CC)
CXX := $(CXX_WRAPPER) $(CXX)
MKDIR ?= mkdir
SLEEP ?= sleep
TOUCH ?= touch

ifdef .PYMAKE
PYCOMMANDPATH += $(PYTHON_SITE_PACKAGES)
endif

# determine debug-related options
_DEBUG_CFLAGS :=
_DEBUG_LDFLAGS :=

ifdef MOZ_DEBUG
  _DEBUG_CFLAGS += $(MOZ_DEBUG_ENABLE_DEFS) $(MOZ_DEBUG_FLAGS)
  _DEBUG_LDFLAGS += $(MOZ_DEBUG_LDFLAGS)
  XULPPFLAGS += $(MOZ_DEBUG_ENABLE_DEFS)
else
  _DEBUG_CFLAGS += $(MOZ_DEBUG_DISABLE_DEFS)
  XULPPFLAGS += $(MOZ_DEBUG_DISABLE_DEFS)
  ifdef MOZ_DEBUG_SYMBOLS
    _DEBUG_CFLAGS += $(MOZ_DEBUG_FLAGS)
    _DEBUG_LDFLAGS += $(MOZ_DEBUG_LDFLAGS)
  endif
endif

OS_CFLAGS += $(_DEBUG_CFLAGS)
OS_CXXFLAGS += $(_DEBUG_CFLAGS)
OS_LDFLAGS += $(_DEBUG_LDFLAGS)

# XXX: What does this? Bug 482434 filed for better explanation.
ifeq ($(OS_ARCH)_$(GNU_CC),WINNT_)
ifdef MOZ_DEBUG
ifneq (,$(MOZ_BROWSE_INFO)$(MOZ_BSCFILE))
OS_CFLAGS += -FR
OS_CXXFLAGS += -FR
endif
else # ! MOZ_DEBUG

# MOZ_DEBUG_SYMBOLS generates debug symbols in separate PDB files.
# Used for generating an optimized build with debugging symbols.
# Used in the Windows nightlies to generate symbols for crash reporting.
ifdef MOZ_DEBUG_SYMBOLS
OS_CXXFLAGS += -Zi -UDEBUG -DNDEBUG
OS_CFLAGS += -Zi -UDEBUG -DNDEBUG
OS_LDFLAGS += -DEBUG -OPT:REF
endif # MOZ_DEBUG_SYMBOLS

#
# Handle trace-malloc in optimized builds.
# No opt to give sane callstacks.
#
ifdef NS_TRACE_MALLOC
MOZ_OPTIMIZE_FLAGS=-Zi -Od -UDEBUG -DNDEBUG
OS_LDFLAGS = -DEBUG -PDB:NONE -OPT:REF -OPT:nowin98
endif # NS_TRACE_MALLOC

endif # MOZ_DEBUG

# We don't build a static CRT when building a custom CRT,
# it appears to be broken. So don't link to jemalloc if
# the Makefile wants static CRT linking.
ifeq ($(MOZ_MEMORY)_$(USE_STATIC_LIBS),1_1)
# Disable default CRT libs and add the right lib path for the linker
MOZ_GLUE_LDFLAGS =
endif

endif # WINNT && !GNU_CC

ifdef MOZ_GLUE_PROGRAM_LDFLAGS
DEFINES += -DMOZ_GLUE_IN_PROGRAM
else
MOZ_GLUE_PROGRAM_LDFLAGS=$(MOZ_GLUE_LDFLAGS)
endif

# Determine if module being compiled is destined 
# to be merged into libxul

ifeq ($(FINAL_LIBRARY),xul)
  ifdef LIBXUL_LIBRARY
    $(error FINAL_LIBRARY is "xul", LIBXUL_LIBRARY is implied)
  endif
  LIBXUL_LIBRARY := 1
endif

ifdef LIBXUL_LIBRARY
ifdef IS_COMPONENT
$(error IS_COMPONENT is set, but is not compatible with LIBXUL_LIBRARY)
endif
SHORT_LIBNAME=
endif

# No sense in profiling tools
ifdef INTERNAL_TOOLS
NO_PROFILE_GUIDED_OPTIMIZE = 1
endif

# Don't build SIMPLE_PROGRAMS with PGO, since they don't need it anyway,
# and we don't have the same build logic to re-link them in the second pass.
ifdef SIMPLE_PROGRAMS
NO_PROFILE_GUIDED_OPTIMIZE = 1
endif

# No sense in profiling unit tests
ifdef CPP_UNIT_TESTS
NO_PROFILE_GUIDED_OPTIMIZE = 1
endif

# Enable profile-based feedback
ifneq (1,$(NO_PROFILE_GUIDED_OPTIMIZE))
ifdef MOZ_PROFILE_GENERATE
OS_CFLAGS += $(if $(filter $(notdir $<),$(notdir $(NO_PROFILE_GUIDED_OPTIMIZE))),,$(PROFILE_GEN_CFLAGS))
OS_CXXFLAGS += $(if $(filter $(notdir $<),$(notdir $(NO_PROFILE_GUIDED_OPTIMIZE))),,$(PROFILE_GEN_CFLAGS))
OS_LDFLAGS += $(PROFILE_GEN_LDFLAGS)
ifeq (WINNT,$(OS_ARCH))
AR_FLAGS += -LTCG
endif
endif # MOZ_PROFILE_GENERATE

ifdef MOZ_PROFILE_USE
OS_CFLAGS += $(if $(filter $(notdir $<),$(notdir $(NO_PROFILE_GUIDED_OPTIMIZE))),,$(PROFILE_USE_CFLAGS))
OS_CXXFLAGS += $(if $(filter $(notdir $<),$(notdir $(NO_PROFILE_GUIDED_OPTIMIZE))),,$(PROFILE_USE_CFLAGS))
OS_LDFLAGS += $(PROFILE_USE_LDFLAGS)
ifeq (WINNT,$(OS_ARCH))
AR_FLAGS += -LTCG
endif
endif # MOZ_PROFILE_USE
endif # NO_PROFILE_GUIDED_OPTIMIZE

ifdef _MSC_VER
OS_LDFLAGS += $(DELAYLOAD_LDFLAGS)
endif # _MSC_VER

# Does the makefile specifies the internal XPCOM API linkage?
ifneq (,$(MOZILLA_INTERNAL_API)$(LIBXUL_LIBRARY))
DEFINES += -DMOZILLA_INTERNAL_API
endif

# Force XPCOM/widget/gfx methods to be _declspec(dllexport) when we're
# building libxul libraries
ifdef LIBXUL_LIBRARY
DEFINES += \
		-D_IMPL_NS_COM \
		-DEXPORT_XPT_API \
		-DEXPORT_XPTC_API \
		-D_IMPL_NS_GFX \
		-D_IMPL_NS_WIDGET \
		-DIMPL_XREAPI \
		-DIMPL_NS_NET \
		-DIMPL_THEBES \
		$(NULL)

ifndef MOZ_NATIVE_ZLIB
DEFINES += -DZLIB_INTERNAL
endif
endif

MAKE_JARS_FLAGS = \
	-t $(topsrcdir) \
	-f $(MOZ_CHROME_FILE_FORMAT) \
	$(NULL)

ifdef USE_EXTENSION_MANIFEST
MAKE_JARS_FLAGS += -e
endif

ifdef BOTH_MANIFESTS
MAKE_JARS_FLAGS += --both-manifests
endif

TAR_CREATE_FLAGS = -chf

#
# Personal makefile customizations go in these optional make include files.
#
MY_CONFIG	:= $(DEPTH)/config/myconfig.mk
MY_RULES	:= $(DEPTH)/config/myrules.mk

#
# Default command macros; can be overridden in <arch>.mk.
#
CCC		= $(CXX)

OS_INCLUDES += $(MOZ_JPEG_CFLAGS) $(MOZ_PNG_CFLAGS) $(MOZ_ZLIB_CFLAGS) $(MOZ_PIXMAN_CFLAGS)

# NSPR_CFLAGS and NSS_CFLAGS must appear ahead of OS_INCLUDES to avoid Linux
# builds wrongly picking up system NSPR/NSS header files.

INCLUDES = \
  -I$(srcdir) \
  -I. \
  $(LOCAL_INCLUDES) \
  -I$(DIST)/include \
  $(if $(LIBXUL_SDK),-I$(LIBXUL_SDK)/include) \
  $(NSPR_CFLAGS) $(NSS_CFLAGS) \
  $(OS_INCLUDES) \
  $(NULL)

include $(topsrcdir)/config/static-checking-config.mk

CFLAGS		= $(OS_CPPFLAGS) $(OS_CFLAGS)
CXXFLAGS	= $(OS_CPPFLAGS) $(OS_CXXFLAGS)
LDFLAGS		= $(OS_LDFLAGS) $(MOZBUILD_LDFLAGS) $(MOZ_FIX_LINK_PATHS)

# Allow each module to override the *default* optimization settings
# by setting MODULE_OPTIMIZE_FLAGS if the developer has not given
# arguments to --enable-optimize
ifdef MOZ_OPTIMIZE
ifeq (1,$(MOZ_OPTIMIZE))
ifdef MODULE_OPTIMIZE_FLAGS
CFLAGS		+= $(MODULE_OPTIMIZE_FLAGS)
CXXFLAGS	+= $(MODULE_OPTIMIZE_FLAGS)
else
ifneq (,$(if $(MOZ_PROFILE_GENERATE)$(MOZ_PROFILE_USE),$(MOZ_PGO_OPTIMIZE_FLAGS)))
CFLAGS		+= $(MOZ_PGO_OPTIMIZE_FLAGS)
CXXFLAGS	+= $(MOZ_PGO_OPTIMIZE_FLAGS)
else
CFLAGS		+= $(MOZ_OPTIMIZE_FLAGS)
CXXFLAGS	+= $(MOZ_OPTIMIZE_FLAGS)
endif # neq (,$(MOZ_PROFILE_GENERATE)$(MOZ_PROFILE_USE))
endif # MODULE_OPTIMIZE_FLAGS
else
CFLAGS		+= $(MOZ_OPTIMIZE_FLAGS)
CXXFLAGS	+= $(MOZ_OPTIMIZE_FLAGS)
endif # MOZ_OPTIMIZE == 1
LDFLAGS		+= $(MOZ_OPTIMIZE_LDFLAGS)
endif # MOZ_OPTIMIZE

ifdef CROSS_COMPILE
HOST_CFLAGS	+= $(HOST_OPTIMIZE_FLAGS)
else
ifdef MOZ_OPTIMIZE
ifeq (1,$(MOZ_OPTIMIZE))
ifdef MODULE_OPTIMIZE_FLAGS
HOST_CFLAGS	+= $(MODULE_OPTIMIZE_FLAGS)
else
HOST_CFLAGS	+= $(MOZ_OPTIMIZE_FLAGS)
endif # MODULE_OPTIMIZE_FLAGS
else
HOST_CFLAGS	+= $(MOZ_OPTIMIZE_FLAGS)
endif # MOZ_OPTIMIZE == 1
endif # MOZ_OPTIMIZE
endif # CROSS_COMPILE

CFLAGS += $(MOZ_FRAMEPTR_FLAGS)
CXXFLAGS += $(MOZ_FRAMEPTR_FLAGS)

ifeq ($(OS_ARCH)_$(GNU_CC),WINNT_)
#// Currently, unless USE_STATIC_LIBS is defined, the multithreaded
#// DLL version of the RTL is used...
#//
#//------------------------------------------------------------------------
ifdef USE_STATIC_LIBS
RTL_FLAGS=-MT          # Statically linked multithreaded RTL
ifneq (,$(MOZ_DEBUG)$(NS_TRACE_MALLOC))
ifndef MOZ_NO_DEBUG_RTL
RTL_FLAGS=-MTd         # Statically linked multithreaded MSVC4.0 debug RTL
endif
endif # MOZ_DEBUG || NS_TRACE_MALLOC

else # !USE_STATIC_LIBS

RTL_FLAGS=-MD          # Dynamically linked, multithreaded RTL
ifneq (,$(MOZ_DEBUG)$(NS_TRACE_MALLOC))
ifndef MOZ_NO_DEBUG_RTL
RTL_FLAGS=-MDd         # Dynamically linked, multithreaded MSVC4.0 debug RTL
endif
endif # MOZ_DEBUG || NS_TRACE_MALLOC
endif # USE_STATIC_LIBS
endif # WINNT && !GNU_CC

ifeq ($(OS_ARCH),Darwin)
# Compiling ObjC requires an Apple compiler anyway, so it's ok to set
# host CMFLAGS here.
HOST_CMFLAGS += -fobjc-exceptions
HOST_CMMFLAGS += -fobjc-exceptions
OS_COMPILE_CMFLAGS += -fobjc-exceptions
OS_COMPILE_CMMFLAGS += -fobjc-exceptions
ifeq ($(MOZ_WIDGET_TOOLKIT),uikit)
OS_COMPILE_CMFLAGS += -fobjc-abi-version=2 -fobjc-legacy-dispatch
OS_COMPILE_CMMFLAGS += -fobjc-abi-version=2 -fobjc-legacy-dispatch
endif
endif

COMPILE_CFLAGS = $(VISIBILITY_FLAGS) $(DEFINES) $(INCLUDES) $(DSO_CFLAGS) $(DSO_PIC_CFLAGS) $(RTL_FLAGS) $(OS_CPPFLAGS) $(OS_COMPILE_CFLAGS) $(CFLAGS) $(MOZBUILD_CFLAGS) $(EXTRA_COMPILE_FLAGS)
COMPILE_CXXFLAGS = $(if $(DISABLE_STL_WRAPPING),,$(STL_FLAGS)) $(VISIBILITY_FLAGS) $(DEFINES) $(INCLUDES) $(DSO_CFLAGS) $(DSO_PIC_CFLAGS) $(RTL_FLAGS) $(OS_CPPFLAGS) $(OS_COMPILE_CXXFLAGS) $(CXXFLAGS) $(MOZBUILD_CXXFLAGS) $(EXTRA_COMPILE_FLAGS)
COMPILE_CMFLAGS = $(OS_COMPILE_CMFLAGS) $(MOZBUILD_CMFLAGS) $(EXTRA_COMPILE_FLAGS)
COMPILE_CMMFLAGS = $(OS_COMPILE_CMMFLAGS) $(MOZBUILD_CMMFLAGS) $(EXTRA_COMPILE_FLAGS)
ASFLAGS += $(EXTRA_ASSEMBLER_FLAGS)

ifndef CROSS_COMPILE
HOST_CFLAGS += $(RTL_FLAGS)
endif

#
# Name of the binary code directories
#
# Override defaults

# Default location of include files
IDL_PARSER_DIR = $(topsrcdir)/xpcom/idl-parser
IDL_PARSER_CACHE_DIR = $(DEPTH)/xpcom/idl-parser

SDK_LIB_DIR = $(DIST)/sdk/lib
SDK_BIN_DIR = $(DIST)/sdk/bin

DEPENDENCIES	= .md

ifeq (xpconnect, $(findstring xpconnect, $(BUILD_MODULES)))
DEFINES +=  -DXPCONNECT_STANDALONE
endif

ELF_DYNSTR_GC	= :

ifeq ($(MOZ_WIDGET_TOOLKIT),qt)
OS_LIBS += $(MOZ_QT_LIBS)
endif

ifndef CROSS_COMPILE
ifdef USE_ELF_DYNSTR_GC
ifdef MOZ_COMPONENTS_VERSION_SCRIPT_LDFLAGS
ELF_DYNSTR_GC 	= $(MOZDEPTH)/config/elf-dynstr-gc
endif
endif
endif

ifeq ($(OS_ARCH),Darwin)
ifdef NEXT_ROOT
export NEXT_ROOT
PBBUILD = NEXT_ROOT= $(PBBUILD_BIN)
else # NEXT_ROOT
PBBUILD = $(PBBUILD_BIN)
endif # NEXT_ROOT
PBBUILD_SETTINGS = GCC_VERSION="$(GCC_VERSION)" SYMROOT=build ARCHS="$(OS_TEST)"
ifdef MACOS_SDK_DIR
PBBUILD_SETTINGS += SDKROOT="$(MACOS_SDK_DIR)"
endif # MACOS_SDK_DIR
ifdef MACOSX_DEPLOYMENT_TARGET
export MACOSX_DEPLOYMENT_TARGET
PBBUILD_SETTINGS += MACOSX_DEPLOYMENT_TARGET="$(MACOSX_DEPLOYMENT_TARGET)"
endif # MACOSX_DEPLOYMENT_TARGET

ifdef MOZ_USING_CCACHE
ifdef CLANG_CXX
export CCACHE_CPP2=1
endif
endif

ifdef MOZ_OPTIMIZE
ifeq (2,$(MOZ_OPTIMIZE))
# Only override project defaults if the config specified explicit settings
PBBUILD_SETTINGS += GCC_MODEL_TUNING= OPTIMIZATION_CFLAGS="$(MOZ_OPTIMIZE_FLAGS)"
endif # MOZ_OPTIMIZE=2
endif # MOZ_OPTIMIZE
endif # OS_ARCH=Darwin

# Set link flags according to whether we want a console.
ifdef MOZ_WINCONSOLE
ifeq ($(MOZ_WINCONSOLE),1)
ifeq ($(OS_ARCH),WINNT)
ifdef GNU_CC
WIN32_EXE_LDFLAGS	+= -mconsole
else
WIN32_EXE_LDFLAGS	+= -SUBSYSTEM:CONSOLE
endif
endif
else # MOZ_WINCONSOLE
ifeq ($(OS_ARCH),WINNT)
ifdef GNU_CC
WIN32_EXE_LDFLAGS	+= -mwindows
else
WIN32_EXE_LDFLAGS	+= -SUBSYSTEM:WINDOWS
endif
endif
endif
endif

ifdef _MSC_VER
ifeq ($(CPU_ARCH),x86_64)
# set stack to 2MB on x64 build.  See bug 582910
WIN32_EXE_LDFLAGS	+= -STACK:2097152
endif
endif

# If we're building a component on MSVC, we don't want to generate an
# import lib, because that import lib will collide with the name of a
# static version of the same library.
ifeq ($(GNU_LD)$(OS_ARCH),WINNT)
ifdef IS_COMPONENT
LDFLAGS += -IMPLIB:fake.lib
DELETE_AFTER_LINK = fake.lib fake.exp
endif
endif

#
# Include any personal overrides the user might think are needed.
#
-include $(topsrcdir)/$(MOZ_BUILD_APP)/app-config.mk
-include $(MY_CONFIG)

######################################################################
# Now test variables that might have been set or overridden by $(MY_CONFIG).

DEFINES		+= -DOSTYPE=\"$(OS_CONFIG)\"
DEFINES		+= -DOSARCH=$(OS_ARCH)

######################################################################

GARBAGE		+= $(DEPENDENCIES) core $(wildcard core.[0-9]*) $(wildcard *.err) $(wildcard *.pure) $(wildcard *_pure_*.o) Templates.DB

ifeq ($(OS_ARCH),Darwin)
ifndef NSDISTMODE
NSDISTMODE=absolute_symlink
endif
PWD := $(CURDIR)
endif

NSINSTALL_PY := $(PYTHON) $(abspath $(MOZILLA_SRCDIR)/config/nsinstall.py)
# For Pymake, whereever we use nsinstall.py we're also going to try to make it
# a native command where possible. Since native commands can't be used outside
# of single-line commands, we continue to provide INSTALL for general use.
# Single-line commands should be switched over to install_cmd.
NSINSTALL_NATIVECMD := %nsinstall nsinstall

ifdef NSINSTALL_BIN
NSINSTALL = $(NSINSTALL_BIN)
else
ifeq ($(HOST_OS_ARCH),WINNT)
NSINSTALL = $(NSINSTALL_PY)
else
NSINSTALL = $(CONFIG_TOOLS)/nsinstall$(HOST_BIN_SUFFIX)
endif # WINNT
endif # NSINSTALL_BIN


ifeq (,$(CROSS_COMPILE)$(filter-out WINNT, $(OS_ARCH)))
INSTALL = $(NSINSTALL) -t
ifdef .PYMAKE
install_cmd = $(NSINSTALL_NATIVECMD) -t $(1)
endif # .PYMAKE

else

# This isn't laid out as conditional directives so that NSDISTMODE can be
# target-specific.
INSTALL         = $(if $(filter copy, $(NSDISTMODE)), $(NSINSTALL) -t, $(if $(filter absolute_symlink, $(NSDISTMODE)), $(NSINSTALL) -L $(PWD), $(NSINSTALL) -R))

endif # WINNT

# The default for install_cmd is simply INSTALL
install_cmd ?= $(INSTALL) $(1)

# Use nsinstall in copy mode to install files on the system
SYSINSTALL  = $(NSINSTALL) -t
# This isn't necessarily true, just here
sysinstall_cmd = install_cmd

# Directory nsinstall.
DIR_INSTALL = $(INSTALL)
dir_install_cmd = install_cmd

#
# Localization build automation
#

# Because you might wish to "make locales AB_CD=ab-CD", we don't hardcode
# MOZ_UI_LOCALE directly, but use an intermediate variable that can be
# overridden by the command line. (Besides, AB_CD is prettier).
AB_CD = $(MOZ_UI_LOCALE)

ifndef L10NBASEDIR
  L10NBASEDIR = $(error L10NBASEDIR not defined by configure)
else
  IS_LANGUAGE_REPACK = 1
endif

EXPAND_LOCALE_SRCDIR = $(if $(filter en-US,$(AB_CD)),$(topsrcdir)/$(1)/en-US,$(or $(realpath $(L10NBASEDIR)),$(abspath $(L10NBASEDIR)))/$(AB_CD)/$(subst /locales,,$(1)))
EXPAND_MOZLOCALE_SRCDIR = $(if $(filter en-US,$(AB_CD)),$(MOZILLA_SRCDIR)/$(1)/en-US,$(or $(realpath $(L10NBASEDIR)),$(abspath $(L10NBASEDIR)))/$(AB_CD)/$(subst /locales,,$(1)))

ifdef relativesrcdir
LOCALE_SRCDIR = $(call EXPAND_LOCALE_SRCDIR,$(relativesrcdir))
endif

ifdef relativesrcdir
MAKE_JARS_FLAGS += --relativesrcdir=$(relativesrcdir)
ifneq (en-US,$(AB_CD))
ifdef LOCALE_MERGEDIR
MAKE_JARS_FLAGS += --locale-mergedir=$(LOCALE_MERGEDIR)
endif
ifdef IS_LANGUAGE_REPACK
MAKE_JARS_FLAGS += --l10n-base=$(L10NBASEDIR)/$(AB_CD)
endif
else
MAKE_JARS_FLAGS += -c $(LOCALE_SRCDIR)
endif # en-US
else
MAKE_JARS_FLAGS += -c $(LOCALE_SRCDIR)
endif # ! relativesrcdir

ifdef LOCALE_MERGEDIR
MERGE_FILE = $(firstword \
  $(wildcard $(LOCALE_MERGEDIR)/$(subst /locales,,$(relativesrcdir))/$(1)) \
  $(wildcard $(LOCALE_SRCDIR)/$(1)) \
  $(srcdir)/en-US/$(1) )
else
MERGE_FILE = $(LOCALE_SRCDIR)/$(1)
endif
MERGE_FILES = $(foreach f,$(1),$(call MERGE_FILE,$(f)))

ifneq (WINNT,$(OS_ARCH))
RUN_TEST_PROGRAM = $(DIST)/bin/run-mozilla.sh
endif # ! WINNT

CREATE_PRECOMPLETE_CMD = $(PYTHON) $(abspath $(MOZILLA_SRCDIR)/config/createprecomplete.py)

# MDDEPDIR is the subdirectory where dependency files are stored
MDDEPDIR := .deps

EXPAND_LIBS_EXEC = $(PYTHON) $(MOZILLA_SRCDIR)/config/expandlibs_exec.py
EXPAND_LIBS_GEN = $(PYTHON) $(MOZILLA_SRCDIR)/config/expandlibs_gen.py
EXPAND_AR = $(EXPAND_LIBS_EXEC) --extract -- $(AR)
EXPAND_CC = $(EXPAND_LIBS_EXEC) --uselist -- $(CC)
EXPAND_CCC = $(EXPAND_LIBS_EXEC) --uselist -- $(CCC)
EXPAND_LD = $(EXPAND_LIBS_EXEC) --uselist -- $(LD)
EXPAND_MKSHLIB_ARGS = --uselist
ifdef SYMBOL_ORDER
EXPAND_MKSHLIB_ARGS += --symbol-order $(SYMBOL_ORDER)
endif
EXPAND_MKSHLIB = $(EXPAND_LIBS_EXEC) $(EXPAND_MKSHLIB_ARGS) -- $(MKSHLIB)

# EXPAND_LIBNAME - $(call EXPAND_LIBNAME,foo)
# expands to $(LIB_PREFIX)foo.$(LIB_SUFFIX) or -lfoo, depending on linker
# arguments syntax. Should only be used for system libraries

# EXPAND_LIBNAME_PATH - $(call EXPAND_LIBNAME_PATH,foo,dir)
# expands to dir/$(LIB_PREFIX)foo.$(LIB_SUFFIX)

# EXPAND_MOZLIBNAME - $(call EXPAND_MOZLIBNAME,foo)
# expands to $(DIST)/lib/$(LIB_PREFIX)foo.$(LIB_SUFFIX)

ifdef GNU_CC
EXPAND_LIBNAME = $(addprefix -l,$(1))
else
EXPAND_LIBNAME = $(foreach lib,$(1),$(LIB_PREFIX)$(lib).$(LIB_SUFFIX))
endif
EXPAND_LIBNAME_PATH = $(foreach lib,$(1),$(2)/$(LIB_PREFIX)$(lib).$(LIB_SUFFIX))
EXPAND_MOZLIBNAME = $(foreach lib,$(1),$(DIST)/lib/$(LIB_PREFIX)$(lib).$(LIB_SUFFIX))

# Include internal ply only if needed
ifndef MOZ_SYSTEM_PLY
PLY_INCLUDE = -I$(MOZILLA_DIR)/other-licenses/ply
endif
 
export CL_INCLUDES_PREFIX

ifneq (,$(MOZ_LIBSTDCXX_TARGET_VERSION)$(MOZ_LIBSTDCXX_HOST_VERSION))
endif

# autoconf.mk sets OBJ_SUFFIX to an error to avoid use before including
# this file
OBJ_SUFFIX := $(_OBJ_SUFFIX)

DEFINES += -DNO_NSPR_10_SUPPORT

ifdef IS_GYP_DIR
LOCAL_INCLUDES += \
  -I$(topsrcdir)/ipc/chromium/src \
  -I$(topsrcdir)/ipc/glue \
  -I$(DEPTH)/ipc/ipdl/_ipdlheaders \
  $(NULL)

ifeq (WINNT,$(OS_TARGET))
# These get set via VC project file settings for normal GYP builds.
DEFINES += -DUNICODE -D_UNICODE
endif

DISABLE_STL_WRAPPING := 1
# Skip most Mozilla-specific include locations.
INCLUDES = -I. $(LOCAL_INCLUDES) -I$(DEPTH)/dist/include
endif

# Run a named Python build action. The first argument is the name of the build
# action. The second argument are the arguments to pass to the action (space
# delimited arguments). e.g.
#
#   libs::
#       $(call py_action,purge_manifests,_build_manifests/purge/foo.manifest)
py_action = $(PYTHON) -m mozbuild.action.$(1) $(2)
