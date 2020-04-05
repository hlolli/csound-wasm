#include "csoundCore.h"
#include "csmodule.h"
#include "corfile.h"

extern int argdecode(CSOUND *, int, const char **);
extern void put_sorted_score(CSOUND *csound, char *ss, FILE* ff);
extern void print_benchmark_info(CSOUND *, const char *);
extern void dieu(CSOUND *, char *, ...);
extern int sensevents(CSOUND *);


extern int wasi_experimental_rtaudio_init(CSOUND *csound);

// csound.exe main entry
int main (int argc, const char **argv ) {
  CSOUND  *csound;
  OPARMS  *O;
  FILE    *xfile = NULL;
  char    *fname = NULL;
  int     result;
  int     csdFound = 0;
  int     n,errs;

  /* printf( "argc = %d\n", argc ); */
  /* for( int i = 0; i < argc; ++i ) { */
  /*   printf( "argv[ %d ] = %s\n", i, argv[ i ] ); */
  /* } */

  csoundInitialize(CSOUNDINIT_NO_SIGNAL_HANDLER);
  csound = csoundCreate(NULL);
  O = csound->oparms;
#ifdef INIT_STATIC_MODULES
  result = init_static_modules(csound);
#endif
  wasi_experimental_rtaudio_init(csound);
  csound->orcname_mode = 0;
  result = argdecode(csound, argc, argv);

  // strange null bugs that needs fix
  if (strlen(csound->orchname) <= 0) {
    csound->orchname = NULL;
  }
  if (strlen(csound->scorename) <= 0) {
    csound->scorename = NULL;
  }
  if (result < 0) {
    return result;
  }

  /* printf("orcname1 %s \n", csound->orchname); */
  /* printf("orcname2 %d \n", strlen(csound->orchname)); */
  /* printf("msgreq1 %s \n", csound->info_message_request); */
  /* printf("msgreq2 %d \n", csound->info_message_request); */
  /* printf("sconame1 %s \n", csound->scorename); */
  /* printf("sconame2 %d \n", csound->scorename); */
  /* printf("csound->use_only_orchfile1 %s \n", csound->use_only_orchfile); */
  /* printf("csound->use_only_orchfile2 %d \n", csound->use_only_orchfile); */

  csoundAppendEnv(csound, "SADIR", "/csound");
  csoundAppendEnv(csound, "SSDIR", "/csound");
  csoundAppendEnv(csound, "INCDIR", "/csound");
  csoundAppendEnv(csound, "MFDIR", "/csound");


  if (csound->info_message_request) {
    csound->info_message_request = 0;
    return 0;
  }
  else if (csound->orchname==NULL && csound->oparms->daemon == 0) {
    dieu(csound, Str("no orchestra name"));
  }
  else if (csound->use_only_orchfile == 0
           && (csound->scorename == NULL || csound->scorename[0] == (char) 0)
           && csound->orchname[0] != '\0') {
    csdFound = 1;
    csound->orcname_mode = 0;
    csound->Message(csound, "UnifiedCSD:  %s\n", csound->orchname);
    if (csound->orchstr==NULL && csound->orchname != NULL) {
      csound->csdname = csound->orchname;
    }
    CORFIL *cf = copy_to_corefile(csound, csound->csdname, NULL, 0);
    if (cf == NULL) {
      csound->Warning(csound, Str("Reading CSD failed (%s)... stopping"));
      return -1;
    }
    corfile_rewind(cf);
    if (!read_unified_file4(csound, cf)) {
      csound->Warning(csound, Str("Reading CSD failed (%s)... stopping"));
      return -1;
    }
  }

  if (csound->scorename == NULL && csound->scorestr==NULL) {
    csound->Message(csound, "scoreless operation\n");
    csound->scorestr = corfile_create_r(csound, "\n\n\ne\n#exit\n");
    corfile_flush(csound, csound->scorestr);
    if (O->RTevents) {
      csound->Message(csound, Str("realtime performance using dummy numeric scorefile\n"));
    }
  }

  if (csound->orchstr==NULL && csound->orchname) {
    csound->Message(csound, Str("orchname:  %s\n"), csound->orchname);
    csound->orcLineOffset = 1;
    csound->orchstr = copy_to_corefile(csound, csound->orchname, NULL, 0);
    if (csound->orchstr == NULL) {
      csound->Message(csound, Str("main: failed to open input file - %s\n"), csound->orchname);
      return -1;
    }
    corfile_puts(csound, "\n#exit\n", csound->orchstr);
    corfile_putc(csound, '\0', csound->orchstr);
    corfile_putc(csound, '\0', csound->orchstr);
    corfile_rewind(csound->orchstr);
  }

  if (csound->xfilename != NULL) {
    csound->Message(csound, "xfilename: %s\n", csound->xfilename);
  }
  csoundLoadExternals(csound);    /* load plugin opcodes */
  if (csoundInitModules(csound) != 0) {
    return -1;
  }
  if (csoundCompileOrcInternal(csound, NULL, 0) != 0) {
    if (csound->oparms->daemon == 0)
      csound->Warning(csound, Str("cannot compile orchestra"));
    else {
      if (csound->oparms->daemon == 0)
        csound->Warning(csound, Str("cannot compile orchestra.\n"
                                    "Csound will start with no instruments"));
    }
  }
  csound->modules_loaded = 1;
  if (csound->enableHostImplementedMIDIIO == 1) {
    csoundSetConfigurationVariable(csound,"rtmidi", "hostbased");
  }
  print_benchmark_info(csound, Str("end of orchestra compile"));
  if (!csoundYield(csound)) {
    return -1;
  }

  if (csound->scorename != NULL &&
      (n = strlen(csound->scorename)) > 4 &&  /* if score ?.srt or ?.xtr */
      (!strcmp(csound->scorename + (n - 4), ".srt") ||
       !strcmp(csound->scorename + (n - 4), ".xtr"))) {
    csound->Message(csound, Str("using previous %s\n"), csound->scorename);
    csound->scorestr = NULL;
    csound->scorestr = copy_to_corefile(csound, csound->scorename, NULL, 1);
  } else {
    if (csound->scorestr==NULL) {
      csound->scorestr = copy_to_corefile(csound, csound->scorename, NULL, 1);
      if (csound->scorestr==NULL) {
        csoundDie(csound, Str("cannot open scorefile %s"), csound->scorename);
      }
    }
    csound->Message(csound, Str("sorting score ...\n"));
    /* printf("score:\n%s", corfile_current(csound->scorestr)); */
    scsortstr(csound, csound->scorestr);
    if (csound->keep_tmp) {
      FILE *ff = fopen("/csound/_tmp.srt", "w");
      if (csound->keep_tmp==1) {
        fputs(corfile_body(csound->scstr), ff);
      } else {
        put_sorted_score(csound, corfile_body(csound->scstr), ff);
      }
      fclose(ff);
    }
  }

  if (csound->xfilename != NULL) {            /* optionally extract */
    if (!(xfile = fopen(csound->xfilename, "r"))) {
      csoundDie(csound, Str("cannot open extract file %s"),csound->xfilename);
    }
    csoundNotifyFileOpened(csound, csound->xfilename, CSFTYPE_EXTRACT_PARMS, 0, 0);
    csound->Message(csound, Str("  ... extracting ...\n"));
    scxtract(csound, csound->scstr, xfile);
    fclose(xfile);
    csound->tempStatus &= ~csPlayScoMask;
  }

  csound->Message(csound, Str("\t... done\n"));

  O->playscore = csound->scstr;
  printf("playscore? \n");
  print_benchmark_info(csound, Str("end of score sort"));

  printf("end of sort? \n");
  if (O->syntaxCheckOnly) {
    printf("syntax check only? \n");
    csound->Message(csound, Str("Syntax check completed.\n"));
    return 0;
  }

  printf("START WASI \n");
  result = csoundStartWasi(csound);
  if (!result) {
    printf("PERFORM WELL \n");
  }
  if (!result) result = csoundPerform(csound);
  errs = csoundErrCnt(csound);
  if (!result) {
    printf("DESTROY MAFAKKA \n");
  }
  csoundDestroy(csound);
  return errs;

}
