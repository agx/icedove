/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


/*

  Windows Live Mail (Win32) import mail and addressbook interfaces

*/
#ifdef MOZ_LOGGING
// sorry, this has to be before the pre-compiled header
#define FORCE_PR_LOG /* Allow logging in the release build */
#endif

#include "nscore.h"
#include "nsStringGlue.h"
#include "nsMsgUtils.h"
#include "nsIServiceManager.h"
#include "nsIImportService.h"
#include "nsWMImport.h"
#include "nsIMemory.h"
#include "nsIImportService.h"
#include "nsIImportMail.h"
#include "nsIImportMailboxDescriptor.h"
#include "nsIImportGeneric.h"
#include "nsIImportAddressBooks.h"
#include "nsIImportABDescriptor.h"
#include "nsIImportFieldMap.h"
#include "nsXPCOM.h"
#include "nsISupportsPrimitives.h"
#include "nsIOutputStream.h"
#include "nsIAddrDatabase.h"
#include "nsWMSettings.h"
#include "nsTextFormatter.h"
#include "nsWMStringBundle.h"
#include "nsIStringBundle.h"
#include "nsUnicharUtils.h"

#include "WMDebugLog.h"

static NS_DEFINE_IID(kISupportsIID, NS_ISUPPORTS_IID);
PRLogModuleInfo *WMLOGMODULE = nsnull;

class ImportWMMailImpl : public nsIImportMail
{
public:
  ImportWMMailImpl();
  virtual ~ImportWMMailImpl();

  static nsresult Create(nsIImportMail** aImport);

  // nsISupports interface
  NS_DECL_ISUPPORTS

  // nsIImportmail interface

  /* void GetDefaultLocation (out nsIFile location, out boolean found, out boolean userVerify); */
  NS_IMETHOD GetDefaultLocation(nsIFile **location, bool *found, bool *userVerify);

  /* nsISupportsArray FindMailboxes (in nsIFile location); */
  NS_IMETHOD FindMailboxes(nsIFile *location, nsISupportsArray **_retval);

  NS_IMETHOD ImportMailbox(nsIImportMailboxDescriptor *source,
                           nsIMsgFolder *dstFolder,
                           PRUnichar **pErrorLog, PRUnichar **pSuccessLog,
                           bool *fatalError);

  /* unsigned long GetImportProgress (); */
  NS_IMETHOD GetImportProgress(PRUint32 *_retval);

  NS_IMETHOD TranslateFolderName(const nsAString & aFolderName, nsAString & _retval);

public:
  static void ReportSuccess(nsString& name, PRInt32 count, nsString *pStream);
  static void ReportError(PRInt32 errorNum, nsString& name, nsString *pStream);
  static void AddLinebreak(nsString *pStream);
  static void SetLogs(nsString& success, nsString& error, PRUnichar **pError, PRUnichar **pSuccess);

private:
  PRUint32 m_bytesDone;
};

nsWMImport::nsWMImport()
{
  // Init logging module.
  if (!WMLOGMODULE)
    WMLOGMODULE = PR_NewLogModule("IMPORT");
  IMPORT_LOG0("nsWMImport Module Created\n");
  nsWMStringBundle::GetStringBundle();
}

nsWMImport::~nsWMImport()
{
  IMPORT_LOG0("nsWMImport Module Deleted\n");
}

NS_IMPL_ISUPPORTS1(nsWMImport, nsIImportModule)

NS_IMETHODIMP nsWMImport::GetName(PRUnichar **name)
{
  NS_ENSURE_ARG_POINTER(name);
  // nsString  title = "Windows Live Mail";
  // *name = ToNewUnicode(title);
  *name = nsWMStringBundle::GetStringByID(WMIMPORT_NAME);

    return NS_OK;
}

NS_IMETHODIMP nsWMImport::GetDescription(PRUnichar **name)
{
  NS_ENSURE_ARG_POINTER(name);

  // nsString  desc = "Windows Live Mail mail and address books";
  // *name = ToNewUnicode(desc);
  *name = nsWMStringBundle::GetStringByID(WMIMPORT_DESCRIPTION);
  return NS_OK;
}

NS_IMETHODIMP nsWMImport::GetSupports(char **supports)
{
  NS_PRECONDITION(supports != nsnull, "null ptr");
  if (! supports)
      return NS_ERROR_NULL_POINTER;

  *supports = strdup(kWMSupportsString);
  return NS_OK;
}

NS_IMETHODIMP nsWMImport::GetSupportsUpgrade(bool *pUpgrade)
{
  NS_PRECONDITION(pUpgrade != nsnull, "null ptr");
  if (! pUpgrade)
    return NS_ERROR_NULL_POINTER;

  *pUpgrade = true;
  return NS_OK;
}

NS_IMETHODIMP nsWMImport::GetImportInterface(const char *pImportType,
                                             nsISupports **ppInterface)
{
  NS_ENSURE_ARG_POINTER(pImportType);
  NS_ENSURE_ARG_POINTER(ppInterface);

  *ppInterface = nsnull;
  nsresult rv;

  if (!strcmp(pImportType, "settings")) {
    nsIImportSettings *pSettings = nsnull;
    rv = nsWMSettings::Create(&pSettings);
    if (NS_SUCCEEDED(rv)) {
      pSettings->QueryInterface(kISupportsIID, (void **)ppInterface);
    }
    NS_IF_RELEASE(pSettings);
    return rv;
  }

  return NS_ERROR_NOT_AVAILABLE;
}

/////////////////////////////////////////////////////////////////////////////////
nsresult ImportWMMailImpl::Create(nsIImportMail** aImport)
{
  NS_ENSURE_ARG_POINTER(aImport);
  *aImport = new ImportWMMailImpl();
  NS_ENSURE_TRUE(*aImport, NS_ERROR_OUT_OF_MEMORY);
  NS_ADDREF(*aImport);
  return NS_OK;
}

ImportWMMailImpl::ImportWMMailImpl()
{
}

ImportWMMailImpl::~ImportWMMailImpl()
{
}

NS_IMPL_THREADSAFE_ISUPPORTS1(ImportWMMailImpl, nsIImportMail)

NS_IMETHODIMP ImportWMMailImpl::TranslateFolderName(const nsAString & aFolderName, nsAString & _retval)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP ImportWMMailImpl::GetDefaultLocation(nsIFile **ppLoc, bool *found,
                                                   bool *userVerify)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP ImportWMMailImpl::FindMailboxes(nsIFile *pLoc,
                                              nsISupportsArray **ppArray)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

void ImportWMMailImpl::AddLinebreak(nsString *pStream)
{
  if (pStream)
    pStream->Append(PRUnichar('\n'));
}

void ImportWMMailImpl::ReportSuccess(nsString& name, PRInt32 count, nsString *pStream)
{
  if (!pStream)
    return;
  // load the success string
  PRUnichar *pFmt = nsWMStringBundle::GetStringByID(WMIMPORT_MAILBOX_SUCCESS);
  PRUnichar *pText = nsTextFormatter::smprintf(pFmt, name.get(), count);
  pStream->Append(pText);
  nsTextFormatter::smprintf_free(pText);
  nsWMStringBundle::FreeString(pFmt);
  AddLinebreak(pStream);
}

void ImportWMMailImpl::ReportError(PRInt32 errorNum, nsString& name, nsString *pStream)
{
  if (!pStream)
    return;
  // load the error string
  PRUnichar *pFmt = nsWMStringBundle::GetStringByID(errorNum);
  PRUnichar *pText = nsTextFormatter::smprintf(pFmt, name.get());
  pStream->Append(pText);
  nsTextFormatter::smprintf_free(pText);
  nsWMStringBundle::FreeString(pFmt);
  AddLinebreak(pStream);
}

void ImportWMMailImpl::SetLogs(nsString& success, nsString& error,
                               PRUnichar **pError, PRUnichar **pSuccess)
{
  if (pError)
    *pError = ToNewUnicode(error);
  if (pSuccess)
    *pSuccess = ToNewUnicode(success);
}

NS_IMETHODIMP ImportWMMailImpl::ImportMailbox(nsIImportMailboxDescriptor *pSource,
                                              nsIMsgFolder *pDstFolder,
                                              PRUnichar **pErrorLog,
                                              PRUnichar **pSuccessLog,
                                              bool *fatalError)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP ImportWMMailImpl::GetImportProgress(PRUint32 *pDoneSoFar)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}
