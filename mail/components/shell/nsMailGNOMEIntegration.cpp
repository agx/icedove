/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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
 * The Original Code is the Mozilla GNOME integration code.
 *
 * The Initial Developer of the Original Code is
 * IBM Corporation.
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Brian Ryner <bryner@brianryner.com>
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

#include "nsMailGNOMEIntegration.h"
#include "nsIGConfService.h"
#include "nsIGIOService.h"
#include "nsCOMPtr.h"
#include "nsIServiceManager.h"
#include "prenv.h"
#include "nsIFile.h"
#include "nsIStringBundle.h"
#include "nsIPromptService.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsEmbedCID.h"
#include "nsMemory.h"
#include "nsIStringBundle.h"

#include <glib.h>
#include <limits.h>
#include <stdlib.h>

static const char* const sMailProtocols[] = {
  "mailto"
};

static const char* const sNewsProtocols[] = {
  "news",
  "snews",
  "nntp"
};

static const char* const sFeedProtocols[] = {
  "feed"
};

nsMailGNOMEIntegration::nsMailGNOMEIntegration(): 
                          mCheckedThisSession(PR_FALSE),
                          mAppIsInPath(PR_FALSE)
{}

nsresult
nsMailGNOMEIntegration::Init()
{
  nsresult rv;

  // GConf _must_ be available, or we do not allow CreateInstance to succeed.

  nsCOMPtr<nsIGConfService> gconf = do_GetService(NS_GCONFSERVICE_CONTRACTID);
  nsCOMPtr<nsIGIOService> giovfs = do_GetService(NS_GIOSERVICE_CONTRACTID);

  if (!gconf && !giovfs)
    return NS_ERROR_NOT_AVAILABLE;

  // Check G_BROKEN_FILENAMES.  If it's set, then filenames in glib use
  // the locale encoding.  If it's not set, they use UTF-8.
  mUseLocaleFilenames = PR_GetEnv("G_BROKEN_FILENAMES") != nsnull;

  if (GetAppPathFromLauncher())
      return NS_OK;

  nsCOMPtr<nsIFile> appPath;
  rv = NS_GetSpecialDirectory(NS_XPCOM_CURRENT_PROCESS_DIR,
                              getter_AddRefs(appPath));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = appPath->AppendNative(NS_LITERAL_CSTRING(MOZ_APP_NAME));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = appPath->GetNativePath(mAppPath);
  return rv;
}

NS_IMPL_ISUPPORTS1(nsMailGNOMEIntegration, nsIShellService)

bool
nsMailGNOMEIntegration::GetAppPathFromLauncher()
{
  gchar *tmp;

  const char *launcher = PR_GetEnv("MOZ_APP_LAUNCHER");
  if (!launcher)
    return PR_FALSE;

  if (g_path_is_absolute(launcher)) {
    mAppPath = launcher;
    tmp = g_path_get_basename(launcher);
    gchar *fullpath = g_find_program_in_path(tmp);
    if (fullpath && mAppPath.Equals(fullpath)) {
      mAppIsInPath = PR_TRUE;
    }
    g_free(fullpath);
  } else {
    tmp = g_find_program_in_path(launcher);
    if (!tmp)
      return PR_FALSE;
    mAppPath = tmp;
    mAppIsInPath = PR_TRUE;
  }

  g_free(tmp);
  return PR_TRUE;
}

NS_IMETHODIMP
nsMailGNOMEIntegration::IsDefaultClient(bool aStartupCheck, PRUint16 aApps, bool * aIsDefaultClient)
{
  *aIsDefaultClient = PR_TRUE;
  if (aApps & nsIShellService::MAIL)
    *aIsDefaultClient &= checkDefault(sMailProtocols, NS_ARRAY_LENGTH(sMailProtocols));
  if (aApps & nsIShellService::NEWS)
    *aIsDefaultClient &= checkDefault(sNewsProtocols, NS_ARRAY_LENGTH(sNewsProtocols));
  if (aApps & nsIShellService::RSS)
    *aIsDefaultClient &= checkDefault(sFeedProtocols, NS_ARRAY_LENGTH(sFeedProtocols));
  
  // If this is the first mail window, maintain internal state that we've
  // checked this session (so that subsequent window opens don't show the 
  // default client dialog).
  if (aStartupCheck)
    mCheckedThisSession = PR_TRUE;
  return NS_OK;
}

NS_IMETHODIMP
nsMailGNOMEIntegration::SetDefaultClient(bool aForAllUsers, PRUint16 aApps)
{
  nsresult rv = NS_OK;
  if (aApps & nsIShellService::MAIL)
    rv |= MakeDefault(sMailProtocols, NS_ARRAY_LENGTH(sMailProtocols));
  if (aApps & nsIShellService::NEWS)
    rv |= MakeDefault(sNewsProtocols, NS_ARRAY_LENGTH(sNewsProtocols));
  if (aApps & nsIShellService::RSS)
    rv |= MakeDefault(sFeedProtocols, NS_ARRAY_LENGTH(sFeedProtocols));
  
  return rv;	
}

NS_IMETHODIMP
nsMailGNOMEIntegration::GetShouldCheckDefaultClient(bool* aResult)
{
  if (mCheckedThisSession) 
  {
    *aResult = PR_FALSE;
    return NS_OK;
  }

  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID));
  return prefs->GetBoolPref("mail.shell.checkDefaultClient", aResult);
}

NS_IMETHODIMP
nsMailGNOMEIntegration::SetShouldCheckDefaultClient(bool aShouldCheck)
{
  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID));
  return prefs->SetBoolPref("mail.shell.checkDefaultClient", aShouldCheck);
}

bool
nsMailGNOMEIntegration::KeyMatchesAppName(const char *aKeyValue) const
{
  gchar *commandPath;
  if (mUseLocaleFilenames) {
    gchar *nativePath = g_filename_from_utf8(aKeyValue, -1, NULL, NULL, NULL);
    if (!nativePath) {
      NS_ERROR("Error converting path to filesystem encoding");
      return PR_FALSE;
    }

    commandPath = g_find_program_in_path(nativePath);
    g_free(nativePath);
  } else {
    commandPath = g_find_program_in_path(aKeyValue);
  }

  if (!commandPath)
    return PR_FALSE;

  bool matches = mAppPath.Equals(commandPath);
  g_free(commandPath);
  return matches;
}

bool
nsMailGNOMEIntegration::CheckHandlerMatchesAppName(const nsACString &handler) const
{
  gint argc;
  gchar **argv;
  nsCAutoString command(handler);

  if (g_shell_parse_argv(command.get(), &argc, &argv, NULL)) {
    command.Assign(argv[0]);
    g_strfreev(argv);
  } else {
    return PR_FALSE;
  }

  return KeyMatchesAppName(command.get());
}

bool
nsMailGNOMEIntegration::checkDefault(const char* const *aProtocols, unsigned int aLength)
{
  nsCOMPtr<nsIGConfService> gconf = do_GetService(NS_GCONFSERVICE_CONTRACTID);
  nsCOMPtr<nsIGIOService> giovfs = do_GetService(NS_GIOSERVICE_CONTRACTID);

  bool enabled;
  nsCAutoString handler;
  nsresult rv;

  for (unsigned int i = 0; i < aLength; ++i) {
    if (gconf) {
      handler.Truncate();
      rv = gconf->GetAppForProtocol(nsDependentCString(aProtocols[i]),
                                    &enabled, handler);
      if (NS_SUCCEEDED(rv) && (!CheckHandlerMatchesAppName(handler) || !enabled)) {
        return PR_FALSE;
      }
    }

    if (giovfs) {
      handler.Truncate();
      nsCOMPtr<nsIGIOMimeApp> app;
      rv = giovfs->GetAppForURIScheme(nsDependentCString(aProtocols[i]),
                                      getter_AddRefs(app));
      if (NS_FAILED(rv) || !app) {
        return PR_FALSE;
      }
      rv = app->GetCommand(handler);
      if (NS_SUCCEEDED(rv) && !CheckHandlerMatchesAppName(handler)) {
        return PR_FALSE;
      }
    }
  }

  return PR_TRUE;
}

nsresult
nsMailGNOMEIntegration::MakeDefault(const char* const *aProtocols,
                                    unsigned int aLength)
{
  nsCAutoString appKeyValue;
  nsCOMPtr<nsIGConfService> gconf = do_GetService(NS_GCONFSERVICE_CONTRACTID);
  nsCOMPtr<nsIGIOService> giovfs = do_GetService(NS_GIOSERVICE_CONTRACTID);
  if(mAppIsInPath) {
    // mAppPath is in the users path, so use only the basename as the launcher
    gchar *tmp = g_path_get_basename(mAppPath.get());
    appKeyValue = tmp;
    g_free(tmp);
  } else {
    appKeyValue = mAppPath;
  }

  appKeyValue.AppendLiteral(" %s");

  nsresult rv;
  if (gconf) {
    for (unsigned int i = 0; i < aLength; ++i) {
      rv = gconf->SetAppForProtocol(nsDependentCString(aProtocols[i]),
                                    appKeyValue);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  if (giovfs) {
    nsCOMPtr<nsIStringBundleService> bundleService =
      do_GetService(NS_STRINGBUNDLE_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIStringBundle> brandBundle;
    rv = bundleService->CreateBundle(BRAND_PROPERTIES, getter_AddRefs(brandBundle));
    NS_ENSURE_SUCCESS(rv, rv);

    nsString brandShortName;
    brandBundle->GetStringFromName(NS_LITERAL_STRING("brandShortName").get(),
                                   getter_Copies(brandShortName));

    // use brandShortName as the application id.
    NS_ConvertUTF16toUTF8 id(brandShortName);

    nsCOMPtr<nsIGIOMimeApp> app;
    rv = giovfs->CreateAppFromCommand(mAppPath, id, getter_AddRefs(app));
    NS_ENSURE_SUCCESS(rv, rv);

    for (unsigned int i = 0; i < aLength; ++i) {
      rv = app->SetAsDefaultForURIScheme(nsDependentCString(aProtocols[i]));
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  return NS_OK;
}
